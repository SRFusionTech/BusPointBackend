import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { Bus } from '../buses/bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { SchoolClass } from '../classes/school-class.entity';
import { ClassSection } from '../classes/class-section.entity';
import { Role } from '../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';
import { Trip } from './trip.entity';
import { TripStop } from './trip-stop.entity';
import { TripsService } from './trips.service';
import { buildParentView } from './parent-view';

/**
 * Parent endpoints. Everything returned here goes through `buildParentView` (privacy filter):
 * own stop + school + bus position only; other stops are anonymous.
 */
@Injectable()
export class ParentTripsService {
  constructor(
    private readonly trips: TripsService,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripStop) private readonly tripStopRepo: Repository<TripStop>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RouteStop) private readonly routeStopRepo: Repository<RouteStop>,
    @InjectRepository(Bus) private readonly busRepo: Repository<Bus>,
    @InjectRepository(BusDriver) private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(SchoolClass) private readonly classRepo: Repository<SchoolClass>,
    @InjectRepository(ClassSection) private readonly sectionRepo: Repository<ClassSection>,
  ) {}

  /** Parent home: child, own stop, bus + driver, running trip (filtered), last trip today. */
  async home(user: JwtPayload) {
    const serverTime = new Date().toISOString();
    const parent = await this.parent(user);
    const child = await this.child(parent);
    if (!parent.routeStopId || !parent.schoolId) {
      return successResponse({ serverTime, settings: null, child, myStop: null, bus: null, driver: null, trip: null, lastTripToday: null, problem: t(I18nKey.TRIP.NO_PICKUP_STOP) });
    }
    const rs = await this.routeStopRepo.findOne({ where: { id: parent.routeStopId } });
    const settings = this.trips.publicSettings(await this.trips.settingsFor(parent.schoolId));
    const myStop = rs ? { id: rs.id, name: rs.name, address: rs.address, lat: rs.lat, lng: rs.lng } : null;

    const running = await this.tripsWithMyStop(parent, { status: 'in_progress', limit: 1 });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const lastToday = running.length ? [] : await this.tripsWithMyStop(parent, { status: 'completed', since: startOfDay, limit: 1 });

    const [runningView] = await this.views(running, parent.routeStopId);
    const [lastView] = await this.views(lastToday, parent.routeStopId);

    // Bus + driver shown even when no trip is running.
    let bus = runningView?.bus ?? null;
    let driver = runningView?.driver ?? null;
    if (!bus && rs) {
      const b = await this.busRepo.findOne({
        where: [
          { schoolId: parent.schoolId, isActive: true, routeId: rs.routeId },
          { schoolId: parent.schoolId, isActive: true, returnRouteId: rs.routeId },
        ],
      });
      if (b) {
        bus = { name: b.name, plateNumber: b.plateNumber };
        const link = await this.busDriverRepo.findOne({ where: { busId: b.id, isActive: true } });
        const d = link ? await this.userRepo.findOne({ where: { id: link.driverId } }) : null;
        driver = d ? { fullName: d.fullName, phone: d.phone } : null;
      }
    }

    return successResponse({
      serverTime,
      settings,
      child,
      myStop,
      bus,
      driver,
      trip: runningView ?? null,
      lastTripToday: lastView ?? null,
      problem: bus ? null : t(I18nKey.TRIP.NO_BUS_FOR_STOP),
    });
  }

  /** Past trips that served this parent's stop: only "my stop" + school times. */
  async history(user: JwtPayload, page = 1, limit = 20) {
    const parent = await this.parent(user);
    if (!parent.routeStopId) return successResponse([], t(I18nKey.COMMON.SUCCESS), { page, limit, total: 0, totalPages: 0 });
    const qb = this.tripRepo
      .createQueryBuilder('t')
      .innerJoin(TripStop, 's', 's.trip_id = t.id AND s.route_stop_id = :rs', { rs: parent.routeStopId })
      .where('t.schoolId = :sid', { sid: parent.schoolId })
      .orderBy('t.startedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [trips, total] = await qb.getManyAndCount();
    const ids = trips.map((x) => x.id);
    const stops = ids.length
      ? await this.tripStopRepo.find({ where: [{ tripId: In(ids), routeStopId: parent.routeStopId }, { tripId: In(ids), kind: 'school' }] })
      : [];
    const rows = trips.map((tr) => {
      const mine = stops.find((s) => s.tripId === tr.id && s.routeStopId === parent.routeStopId);
      const school = stops.find((s) => s.tripId === tr.id && s.kind === 'school');
      return {
        id: tr.id,
        status: tr.status,
        direction: tr.direction,
        routeName: tr.routeName,
        startedAt: tr.startedAt.toISOString(),
        endedAt: tr.endedAt?.toISOString() ?? null,
        endReason: tr.endReason,
        durationSec: Math.round(((tr.endedAt ?? new Date()).getTime() - tr.startedAt.getTime()) / 1000),
        myStop: mine ? { status: mine.status, arrivedAt: mine.arrivedAt?.toISOString() ?? null } : null,
        school: school ? { status: school.status, arrivedAt: school.arrivedAt?.toISOString() ?? null } : null,
      };
    });
    return successResponse(rows, t(I18nKey.COMMON.SUCCESS), { page, limit, total, totalPages: Math.ceil(total / limit) });
  }

  /** One trip, filtered. Only if the trip served this parent's stop. */
  async detail(user: JwtPayload, tripId: string) {
    const parent = await this.parent(user);
    const trip = await this.tripRepo.findOne({ where: { id: tripId, schoolId: parent.schoolId ?? '' } });
    const served =
      trip && parent.routeStopId ? await this.tripStopRepo.exists({ where: { tripId, routeStopId: parent.routeStopId } }) : false;
    if (!trip || !served) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
    const [view] = await this.views([trip], parent.routeStopId);
    return successResponse(view);
  }

  /** Filtered views for many trips (used by the realtime publisher too). */
  async views(trips: Trip[], myRouteStopId: string | null) {
    const snaps = await this.trips.snapshots(trips, {});
    return snaps.map((s) => buildParentView(s, myRouteStopId));
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  private async parent(user: JwtPayload): Promise<User> {
    const parent = await this.userRepo.findOne({ where: { id: user.sub, role: Role.PARENT, isActive: true } });
    if (!parent) throw new NotFoundException(t(I18nKey.COMMON.NOT_FOUND));
    return parent;
  }

  private async tripsWithMyStop(parent: User, opts: { status: 'in_progress' | 'completed'; since?: Date; limit: number }) {
    const qb = this.tripRepo
      .createQueryBuilder('t')
      .innerJoin(TripStop, 's', 's.trip_id = t.id AND s.route_stop_id = :rs', { rs: parent.routeStopId })
      .where('t.schoolId = :sid', { sid: parent.schoolId })
      .andWhere('t.status = :st', { st: opts.status });
    if (opts.since) qb.andWhere('t.startedAt >= :since', { since: opts.since });
    return qb.orderBy('t.startedAt', 'DESC').take(opts.limit).getMany();
  }

  private async child(parent: User) {
    const cls = parent.childClassId != null ? await this.classRepo.findOne({ where: { id: parent.childClassId } }) : null;
    const sec = parent.childSectionId != null ? await this.sectionRepo.findOne({ where: { id: parent.childSectionId } }) : null;
    return {
      name: parent.childName,
      className: cls ? (sec ? `${cls.name} - ${sec.name}` : cls.name) : null,
    };
  }
}
