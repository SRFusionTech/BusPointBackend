import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Bus } from '../buses/bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { Route } from '../routes/route.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { School } from '../schools/school.entity';
import { User } from '../users/user.entity';
import { SchoolClass } from '../classes/school-class.entity';
import { ClassSection } from '../classes/class-section.entity';
import { Role } from '../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';
import { Trip, type CheckInResponse, type TripEndReason } from './trip.entity';
import { TripChanges } from './trip-changes';
import { SosDto } from './dto/sos.dto';
import { TripStop } from './trip-stop.entity';
import { TripLocation } from './trip-location.entity';
import { TripEvent, type TripEventType } from './trip-event.entity';
import { StartTripDto } from './dto/start-trip.dto';
import { LocationBatchDto } from './dto/location-batch.dto';
import { ListTripsQuery } from './dto/list-trips.query';
import { resolveTrackingSettings, type TrackingSettings } from './tracking-settings';
import { detectDirection, originRadiusM, plannedStops, routeOrigin, type TripDirection } from './engine/direction';
import { initialEngineState, processPoints, type EngineState, type EngineStop, type GpsPoint } from './engine/stop-engine';
import { computeEtas } from './engine/eta';
import { bearingDeg, distanceM } from './engine/geo';
import { presenceOf } from './engine/presence';

type EventRow = { type: TripEventType; at: Date; payload: Record<string, unknown> };

export interface StudentInfo {
  parentId: string;
  parentName: string | null;
  parentPhone: string | null;
  childName: string | null;
  className: string | null;
}

const MAX_TRAIL_POINTS = 500;

function formatDistance(m: number | undefined): string {
  if (m === undefined) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripStop) private readonly tripStopRepo: Repository<TripStop>,
    @InjectRepository(TripLocation) private readonly locationRepo: Repository<TripLocation>,
    @InjectRepository(TripEvent) private readonly eventRepo: Repository<TripEvent>,
    @InjectRepository(Bus) private readonly busRepo: Repository<Bus>,
    @InjectRepository(BusDriver) private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(Route) private readonly routeRepo: Repository<Route>,
    @InjectRepository(RouteStop) private readonly routeStopRepo: Repository<RouteStop>,
    @InjectRepository(School) private readonly schoolRepo: Repository<School>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SchoolClass) private readonly classRepo: Repository<SchoolClass>,
    @InjectRepository(ClassSection) private readonly sectionRepo: Repository<ClassSection>,
    private readonly changes: TripChanges,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Driver: start / locations / end / active
  // ══════════════════════════════════════════════════════════════════════════

  /** Start a trip. Direction comes from where the driver is (school → drop, route start → pickup). */
  async start(user: JwtPayload, dto: StartTripDto) {
    const bus = await this.driverBus(user.sub);
    if (!bus.routeId) throw new BadRequestException(t(I18nKey.TRIP.NO_ROUTE));

    const running = await this.tripRepo.findOne({ where: { busId: bus.id, status: 'in_progress' } });
    if (running) {
      if (running.driverId !== user.sub) throw new ConflictException(t(I18nKey.TRIP.ALREADY_RUNNING));
      return successResponse(await this.snapshotOne(running), t(I18nKey.TRIP.STARTED));
    }

    const settings = await this.settingsFor(bus.schoolId);
    const routes = await this.routesForBus(bus);
    if (routes.pickup.stops.length < 2 && routes.drop.stops.length < 2) {
      throw new BadRequestException(t(I18nKey.TRIP.ROUTE_EMPTY));
    }

    const { chosen, candidates } = detectDirection(dto, { pickup: routes.pickup.stops, drop: routes.drop.stops }, settings);
    if (!chosen) {
      const school = candidates.find((c) => c.direction === 'drop');
      const routeStart = candidates.find((c) => c.direction === 'pickup');
      throw new BadRequestException(
        t(I18nKey.TRIP.NOT_AT_START, {
          school: formatDistance(school?.distanceM),
          routeStart: formatDistance(routeStart?.distanceM),
          routeStartName: routeStart?.origin.name ?? 'the first stop',
        }),
      );
    }

    const route = routes[chosen.direction];
    const planned = plannedStops(route.stops, chosen.direction);
    const now = new Date();
    const startPoint: GpsPoint = { lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy ?? null, recordedAt: now.toISOString() };

    const trip = await this.dataSource.transaction(async (em) => {
      const engine = initialEngineState(startPoint);
      let saved: Trip;
      try {
        saved = await em.save(
          em.create(Trip, {
            schoolId: bus.schoolId,
            busId: bus.id,
            driverId: user.sub,
            routeId: route.id,
            routeName: route.name,
            direction: chosen.direction,
            status: 'in_progress',
            startedAt: now,
            distanceM: 0,
            lastLat: dto.lat,
            lastLng: dto.lng,
            lastAccuracy: dto.accuracy ?? null,
            lastPingAt: now,
            stationarySince: now,
            engineState: engine,
          }),
        );
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw new ConflictException(t(I18nKey.TRIP.ALREADY_RUNNING));
        throw err;
      }

      const stops = planned.map((r, seq) =>
        em.create(TripStop, {
          tripId: saved.id,
          routeStopId: r.id,
          seq,
          name: r.name,
          address: r.address,
          kind: r.kind,
          lat: r.lat,
          lng: r.lng,
          // The trip starts AT the first stop, so it's reached immediately.
          status: seq === 0 ? 'reached' : 'pending',
          arrivedAt: seq === 0 ? now : null,
        }),
      );
      const savedStops = await em.save(stops);
      this.applyEtas(saved, savedStops, settings);
      await em.save(savedStops);

      await em.insert(TripLocation, { tripId: saved.id, recordedAt: now, lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy ?? null });
      await this.insertEvents(em, saved.id, [
        { type: 'started', at: now, payload: { direction: chosen.direction, lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy ?? null } },
        { type: 'stop_reached', at: now, payload: { stopId: savedStops[0].id, name: savedStops[0].name } },
      ]);
      return saved;
    });

    this.logger.log(`Trip ${trip.id} started: bus ${bus.id}, ${chosen.direction}, route ${route.id}`);
    this.changes.changed(trip.id);
    return successResponse(await this.snapshotOne(trip), t(I18nKey.TRIP.STARTED));
  }

  /** A batch of GPS points from the driver phone. Returns the fresh trip snapshot. */
  async ingestLocations(user: JwtPayload, tripId: string, dto: LocationBatchDto) {
    const now = new Date();
    const trip = await this.dataSource.transaction(async (em) => {
      // Row lock: batches for the same trip are processed one at a time, in order.
      const trip = await em.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== user.sub) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
      if (trip.status !== 'in_progress' || dto.points.length === 0) return trip;

      const settings = await this.settingsFor(trip.schoolId);
      const stops = await em.find(TripStop, { where: { tripId }, order: { seq: 'ASC' } });
      const prevState = this.normalizeState(trip.engineState);
      const prevPoint = prevState.lastPoint;

      const result = processPoints(this.toEngineStops(stops), prevState, dto.points as GpsPoint[], settings, now);

      if (result.accepted.length > 0) {
        await em.insert(
          TripLocation,
          result.accepted.map((p) => ({
            tripId,
            recordedAt: new Date(p.recordedAt),
            lat: p.lat,
            lng: p.lng,
            speed: p.speed ?? null,
            heading: p.heading ?? null,
            accuracy: p.accuracy ?? null,
          })),
        );
      }

      const events: EventRow[] = [];
      const byId = new Map(stops.map((s) => [s.id, s]));
      for (const es of result.stops) {
        const row = byId.get(es.id);
        if (!row) continue;
        row.status = es.status;
        row.arrivedAt = es.arrivedAt ? new Date(es.arrivedAt) : null;
      }
      for (const e of result.events) {
        if (e.type === 'completed') continue;
        const stop = byId.get(e.stopId);
        events.push({ type: e.type, at: new Date(e.at), payload: { stopId: e.stopId, name: stop?.name ?? null } });
      }

      const last = result.state.lastPoint;
      if (result.accepted.length > 0 && last) {
        const lastAt = new Date(last.recordedAt);
        trip.lastLat = last.lat;
        trip.lastLng = last.lng;
        trip.lastAccuracy = last.accuracy ?? null;
        trip.lastPingAt = lastAt > now ? now : lastAt;
        trip.lastHeading =
          last.heading != null && last.heading >= 0
            ? last.heading
            : prevPoint && distanceM(prevPoint, last) >= settings.jitterM
              ? bearingDeg(prevPoint, last)
              : trip.lastHeading;
        if (trip.gpsLostAt) {
          events.push({ type: 'gps_restored', at: trip.lastPingAt, payload: { lostAt: trip.gpsLostAt.toISOString() } });
          trip.gpsLostAt = null;
        }
      }
      trip.distanceM = result.state.distanceM;
      trip.lastSpeedKmh = result.state.speedKmh;
      trip.stationarySince = result.state.anchor ? new Date(result.state.anchor.since) : null;
      trip.engineState = result.state;

      if (result.completedAt) {
        this.markEnded(trip, stops, 'last_stop', new Date(result.completedAt), events);
      } else {
        this.applyEtas(trip, stops, settings);
      }

      await em.save(trip);
      await em.save(stops);
      await this.insertEvents(em, tripId, events);
      return trip;
    });

    this.changes.changed(trip.id);
    return successResponse(await this.snapshotOne(trip), t(I18nKey.TRIP.LOCATIONS_SAVED));
  }

  /** Manual end (backup — normally the trip ends by itself at the last stop). */
  async end(user: JwtPayload, tripId: string) {
    const trip = await this.dataSource.transaction(async (em) => {
      const trip = await em.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== user.sub) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
      if (trip.status !== 'in_progress') return trip;
      await this.closeInTx(em, trip, 'manual', new Date());
      return trip;
    });
    this.changes.changed(trip.id);
    return successResponse(await this.snapshotOne(trip), t(I18nKey.TRIP.ENDED));
  }

  /** Driver answers "Bus stopped — everything OK?". Breakdown / emergency alert the school at once. */
  async checkIn(user: JwtPayload, tripId: string, response: CheckInResponse) {
    const now = new Date();
    const trip = await this.dataSource.transaction(async (em) => {
      const trip = await em.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== user.sub) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
      if (trip.status !== 'in_progress') throw new BadRequestException(t(I18nKey.TRIP.NOT_RUNNING));
      trip.checkInResponse = response;
      trip.checkInRespondedAt = now;
      if (!trip.checkInRequestedAt) trip.checkInRequestedAt = now;
      const events: EventRow[] = [{ type: 'check_in', at: now, payload: { response } }];
      if (response === 'breakdown' || response === 'emergency') {
        trip.stationaryAlertAt = now;
        events.push({ type: 'stationary', at: now, payload: { since: trip.stationarySince?.toISOString() ?? null, reason: response } });
      }
      if (response === 'emergency') {
        trip.sosAt = now;
        trip.sosAckAt = null;
        trip.sosNote = 'Emergency (check-in reply)';
        events.push({ type: 'sos', at: now, payload: { note: trip.sosNote, lat: trip.lastLat, lng: trip.lastLng } });
      }
      await em.save(trip);
      await this.insertEvents(em, trip.id, events);
      return trip;
    });
    this.changes.changed(trip.id);
    return successResponse(await this.snapshotOne(trip), t(I18nKey.TRIP.CHECK_IN_SAVED));
  }

  /** Driver presses SOS. School sees it immediately (fleet page + live push). */
  async sos(user: JwtPayload, tripId: string, dto: SosDto) {
    const now = new Date();
    const trip = await this.dataSource.transaction(async (em) => {
      const trip = await em.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== user.sub) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
      if (trip.status !== 'in_progress') throw new BadRequestException(t(I18nKey.TRIP.NOT_RUNNING));
      trip.sosAt = now;
      trip.sosAckAt = null;
      trip.sosNote = dto.note?.trim() || null;
      const lat = dto.lat ?? trip.lastLat;
      const lng = dto.lng ?? trip.lastLng;
      await em.save(trip);
      await this.insertEvents(em, trip.id, [{ type: 'sos', at: now, payload: { note: trip.sosNote, lat, lng } }]);
      return trip;
    });
    this.logger.warn(`SOS on trip ${trip.id}`);
    this.changes.changed(trip.id);
    return successResponse(await this.snapshotOne(trip), t(I18nKey.TRIP.SOS_SENT));
  }

  /** School admin acknowledges the SOS or the current alerts. */
  async acknowledge(user: JwtPayload, tripId: string, type: 'sos' | 'alerts') {
    const now = new Date();
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip || trip.schoolId !== user.schoolId) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));
    await this.tripRepo.update({ id: tripId }, type === 'sos' ? { sosAckAt: now } : { alertsAckAt: now });
    await this.eventRepo.insert({ tripId, type: 'alert_ack', at: now, payload: { type, by: user.sub } });
    this.changes.changed(tripId);
    const fresh = await this.tripRepo.findOneOrFail({ where: { id: tripId } });
    return successResponse(await this.snapshotOne(fresh), t(I18nKey.TRIP.ACKNOWLEDGED));
  }

  /** Used by the monitor: close a trip that stopped sending GPS long ago. */
  async autoClose(tripId: string, at: Date) {
    await this.dataSource.transaction(async (em) => {
      const trip = await em.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.status !== 'in_progress') return;
      await this.closeInTx(em, trip, 'auto_timeout', at);
      this.logger.warn(`Trip ${tripId} auto-closed (no GPS)`);
    });
    this.changes.changed(tripId);
  }

  /**
   * Driver home: bus, running trip (if any), and — when idle — where they can start from.
   * Never throws for "no bus / no route" so the app can show the reason.
   */
  async active(user: JwtPayload) {
    const serverTime = new Date().toISOString();
    const link = await this.busDriverRepo.findOne({ where: { driverId: user.sub, isActive: true } });
    const bus = link ? await this.busRepo.findOne({ where: { id: link.busId, isActive: true } }) : null;
    if (!bus) {
      return successResponse({ serverTime, bus: null, trip: null, startOptions: [], settings: null, problem: t(I18nKey.TRIP.NO_BUS) });
    }
    const settings = await this.settingsFor(bus.schoolId);
    const busInfo = { id: bus.id, name: bus.name, plateNumber: bus.plateNumber, capacity: bus.capacity };
    const publicSettings = this.publicSettings(settings);

    const running = await this.tripRepo.findOne({ where: { busId: bus.id, status: 'in_progress' } });
    if (running) {
      return successResponse({ serverTime, bus: busInfo, trip: await this.snapshotOne(running), startOptions: [], settings: publicSettings, problem: null });
    }
    if (!bus.routeId) {
      return successResponse({ serverTime, bus: busInfo, trip: null, startOptions: [], settings: publicSettings, problem: t(I18nKey.TRIP.NO_ROUTE) });
    }

    const routes = await this.routesForBus(bus);
    const startOptions = (['pickup', 'drop'] as const).flatMap((direction) => {
      const r = routes[direction];
      const origin = routeOrigin(r.stops, direction);
      if (!origin || r.stops.length < 2) return [];
      const stops = plannedStops(r.stops, direction);
      return [{
        direction,
        routeId: r.id,
        routeName: r.name,
        startAt: { name: origin.name, kind: origin.kind, lat: origin.lat, lng: origin.lng, radiusM: originRadiusM(origin, settings) },
        endAt: { name: stops[stops.length - 1].name, kind: stops[stops.length - 1].kind },
        stopCount: stops.length,
      }];
    });

    // Last finished trip today, so the home screen can show "Pickup done at 8:09".
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const lastTrip = await this.tripRepo
      .createQueryBuilder('t')
      .where('t.busId = :busId', { busId: bus.id })
      .andWhere('t.startedAt >= :d', { d: startOfDay })
      .orderBy('t.startedAt', 'DESC')
      .getOne();

    return successResponse({
      serverTime,
      bus: busInfo,
      trip: null,
      lastTripToday: lastTrip ? (await this.summaries([lastTrip]))[0] : null,
      startOptions,
      settings: publicSettings,
      problem: startOptions.length ? null : t(I18nKey.TRIP.ROUTE_EMPTY),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // School admin: fleet
  // ══════════════════════════════════════════════════════════════════════════

  /** Every bus of the school with driver, route, presence and (if running) the full trip. */
  async fleet(schoolId: string) {
    const now = new Date();
    const settings = await this.settingsFor(schoolId);
    const buses = await this.busRepo.find({ where: { schoolId, isActive: true }, order: { name: 'ASC' } });
    const busIds = buses.map((b) => b.id);

    const links = busIds.length ? await this.busDriverRepo.find({ where: { busId: In(busIds), isActive: true } }) : [];
    const driverIds = links.map((l) => l.driverId);
    const drivers = driverIds.length ? await this.userRepo.find({ where: { id: In(driverIds) } }) : [];
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const driverByBus = new Map(links.map((l) => [l.busId, driverById.get(l.driverId) ?? null]));

    const routeIds = [...new Set(buses.flatMap((b) => [b.routeId, b.returnRouteId]).filter((x): x is string => !!x))];
    const routes = routeIds.length ? await this.routeRepo.find({ where: { id: In(routeIds) } }) : [];
    const routeById = new Map(routes.map((r) => [r.id, r]));

    const running = busIds.length ? await this.tripRepo.find({ where: { schoolId, status: 'in_progress' } }) : [];
    const snapshots = await this.snapshots(running, { now });
    const snapByBus = new Map(snapshots.map((s) => [s.bus?.id, s]));

    const items = buses.map((b) => {
      const d = driverByBus.get(b.id) ?? null;
      const trip = snapByBus.get(b.id) ?? null;
      const route = b.routeId ? routeById.get(b.routeId) : undefined;
      const returnRoute = b.returnRouteId ? routeById.get(b.returnRouteId) : undefined;
      return {
        bus: { id: b.id, name: b.name, plateNumber: b.plateNumber, capacity: b.capacity },
        driver: d ? { id: d.id, fullName: d.fullName, phone: d.phone } : null,
        route: route ? { id: route.id, name: route.name } : null,
        returnRoute: returnRoute ? { id: returnRoute.id, name: returnRoute.name } : null,
        presence: trip ? trip.presence : 'not_on_trip',
        trip,
      };
    });

    const onTrip = items.filter((i) => i.trip);
    return successResponse({
      serverTime: now.toISOString(),
      settings: this.publicSettings(settings),
      summary: {
        totalBuses: items.length,
        onTrip: onTrip.length,
        live: onTrip.filter((i) => i.presence === 'live').length,
        away: onTrip.filter((i) => i.presence === 'away').length,
        offline: onTrip.filter((i) => i.presence === 'offline').length,
        alerts: onTrip.filter((i) => i.trip?.alerts.gpsLost || i.trip?.alerts.stationary || i.trip?.alerts.sos).length,
        sos: onTrip.filter((i) => i.trip?.alerts.sos && !i.trip.alerts.sos.acknowledgedAt).length,
      },
      buses: items,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // History (driver: own trips · school admin: all school trips)
  // ══════════════════════════════════════════════════════════════════════════

  async list(user: JwtPayload, q: ListTripsQuery) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const qb = this.tripRepo.createQueryBuilder('t');
    if (user.role === Role.DRIVER) qb.where('t.driverId = :uid', { uid: user.sub });
    else {
      if (!user.schoolId) throw new ForbiddenException(t(I18nKey.COMMON.NO_SCHOOL));
      qb.where('t.schoolId = :sid', { sid: user.schoolId });
      if (q.busId) qb.andWhere('t.busId = :busId', { busId: q.busId });
    }
    if (q.from) qb.andWhere('t.startedAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('t.startedAt < :to', { to: new Date(q.to) });
    if (q.direction) qb.andWhere('t.direction = :dir', { dir: q.direction });
    qb.orderBy('t.startedAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [trips, total] = await qb.getManyAndCount();
    return successResponse(await this.summaries(trips), t(I18nKey.COMMON.SUCCESS), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }

  /** Full trip: snapshot + every event + (thinned) GPS trail. */
  async detail(user: JwtPayload, id: string) {
    const trip = await this.tripRepo.findOne({ where: { id } });
    const allowed =
      trip &&
      ((user.role === Role.DRIVER && trip.driverId === user.sub) ||
        (user.role === Role.SCHOOL_ADMIN && trip.schoolId === user.schoolId));
    if (!trip || !allowed) throw new NotFoundException(t(I18nKey.TRIP.NOT_FOUND));

    const [snapshot] = await this.snapshots([trip], {});
    const events = await this.eventRepo.find({ where: { tripId: id }, order: { at: 'ASC', id: 'ASC' } });

    const trail = await this.locationRepo.find({ where: { tripId: id }, order: { recordedAt: 'ASC' } });
    const step = Math.max(1, Math.ceil(trail.length / MAX_TRAIL_POINTS));
    const thinned = trail.filter((_, i) => i % step === 0 || i === trail.length - 1);

    return successResponse({
      ...snapshot,
      events: events.map((e) => ({ type: e.type, at: e.at.toISOString(), payload: e.payload })),
      trail: thinned.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt.toISOString(), speed: p.speed, accuracy: p.accuracy })),
      trailPointsTotal: trail.length,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Snapshot builders
  // ══════════════════════════════════════════════════════════════════════════

  async snapshotOne(trip: Trip) {
    const [s] = await this.snapshots([trip], {});
    return s;
  }

  /** Builds full snapshots for many trips with a fixed number of queries (no N+1). */
  async snapshots(trips: Trip[], opts: { now?: Date }) {
    if (trips.length === 0) return [];
    const now = opts.now ?? new Date();
    const tripIds = trips.map((x) => x.id);

    const [stops, buses, drivers] = await Promise.all([
      this.tripStopRepo.find({ where: { tripId: In(tripIds) }, order: { seq: 'ASC' } }),
      this.busRepo.find({ where: { id: In([...new Set(trips.map((x) => x.busId))]) } }),
      this.userRepo.find({ where: { id: In([...new Set(trips.map((x) => x.driverId))]) } }),
    ]);
    const busById = new Map(buses.map((b) => [b.id, b]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const stopsByTrip = new Map<string, TripStop[]>();
    for (const s of stops) stopsByTrip.set(s.tripId, [...(stopsByTrip.get(s.tripId) ?? []), s]);

    const students = await this.studentsByRouteStop(stops.map((s) => s.routeStopId).filter((x): x is string => !!x));
    const settingsCache = new Map<string, TrackingSettings>();
    const settingsOf = async (schoolId: string) => {
      if (!settingsCache.has(schoolId)) settingsCache.set(schoolId, await this.settingsFor(schoolId));
      return settingsCache.get(schoolId)!;
    };

    return Promise.all(
      trips.map(async (trip) => {
        const settings = await settingsOf(trip.schoolId);
        const tStops = stopsByTrip.get(trip.id) ?? [];
        const bus = busById.get(trip.busId);
        const driver = driverById.get(trip.driverId);
        const onTrip = trip.status === 'in_progress';
        const engine = this.normalizeState(trip.engineState);
        const next = tStops.find((s) => s.status === 'pending') ?? null;
        // Alert belongs to the current not-moving window only; once the bus moves, `stationarySince` advances past it.
        const stationaryMin =
          onTrip && trip.stationaryAlertAt && trip.stationarySince && trip.stationaryAlertAt >= trip.stationarySince
            ? Math.round((now.getTime() - trip.stationarySince.getTime()) / 60_000)
            : null;

        return {
          id: trip.id,
          status: trip.status,
          direction: trip.direction as TripDirection,
          routeId: trip.routeId,
          routeName: trip.routeName,
          startedAt: trip.startedAt.toISOString(),
          endedAt: trip.endedAt?.toISOString() ?? null,
          endReason: trip.endReason,
          durationSec: Math.round(((trip.endedAt ?? now).getTime() - trip.startedAt.getTime()) / 1000),
          distanceM: Math.round(trip.distanceM),
          bus: bus ? { id: bus.id, name: bus.name, plateNumber: bus.plateNumber } : null,
          driver: driver ? { id: driver.id, fullName: driver.fullName, phone: driver.phone } : null,
          live:
            trip.lastLat != null && trip.lastLng != null
              ? {
                  lat: trip.lastLat,
                  lng: trip.lastLng,
                  speedKmh: trip.lastSpeedKmh != null ? Math.round(trip.lastSpeedKmh * 10) / 10 : null,
                  heading: trip.lastHeading,
                  accuracy: trip.lastAccuracy,
                  lastPingAt: trip.lastPingAt?.toISOString() ?? null,
                }
              : null,
          presence: presenceOf(trip.lastPingAt, onTrip, now, settings),
          progress: {
            total: tStops.length,
            reached: tStops.filter((s) => s.status === 'reached').length,
            skipped: tStops.filter((s) => s.status === 'skipped').length,
            pending: tStops.filter((s) => s.status === 'pending').length,
          },
          atStopId: onTrip ? engine.atStopId : null,
          nextStopId: onTrip ? next?.id ?? null : null,
          alerts: this.alertsOf(trip, onTrip, stationaryMin),
          stops: tStops.map((s) => {
            const list = (s.routeStopId && students.get(s.routeStopId)) || [];
            return {
              id: s.id,
              routeStopId: s.routeStopId,
              seq: s.seq,
              name: s.name,
              address: s.address,
              kind: s.kind,
              lat: s.lat,
              lng: s.lng,
              status: s.status,
              arrivedAt: s.arrivedAt?.toISOString() ?? null,
              etaAt: s.etaAt?.toISOString() ?? null,
              distanceM: s.distanceM != null ? Math.round(s.distanceM) : null,
              studentsCount: list.length,
              students: list,
            };
          }),
        };
      }),
    );
  }

  /** Alerts block shared by every snapshot. `acknowledgedAt` = school has seen it. */
  private alertsOf(trip: Trip, onTrip: boolean, stationaryMin: number | null) {
    const ackOf = (since: Date | null) => (trip.alertsAckAt && since && trip.alertsAckAt >= since ? trip.alertsAckAt.toISOString() : null);
    const windowStart = trip.stationarySince;
    const checkInForWindow = trip.checkInRequestedAt && windowStart && trip.checkInRequestedAt >= windowStart;
    return {
      gpsLost: onTrip && trip.gpsLostAt ? { since: trip.gpsLostAt.toISOString(), acknowledgedAt: ackOf(trip.gpsLostAt) } : null,
      stationary:
        stationaryMin != null && trip.stationarySince
          ? {
              since: trip.stationarySince.toISOString(),
              minutes: stationaryMin,
              reason: trip.checkInResponse && checkInForWindow ? trip.checkInResponse : null,
              acknowledgedAt: ackOf(trip.stationaryAlertAt),
            }
          : null,
      checkIn:
        onTrip && checkInForWindow && trip.checkInRequestedAt
          ? {
              requestedAt: trip.checkInRequestedAt.toISOString(),
              response: trip.checkInResponse,
              respondedAt: trip.checkInRespondedAt?.toISOString() ?? null,
            }
          : null,
      sos:
        onTrip && trip.sosAt
          ? { at: trip.sosAt.toISOString(), note: trip.sosNote, acknowledgedAt: trip.sosAckAt?.toISOString() ?? null }
          : null,
    };
  }

  /** Light rows for history lists. */
  private async summaries(trips: Trip[]) {
    if (trips.length === 0) return [];
    const ids = trips.map((x) => x.id);
    const [counts, alertRows, buses, drivers] = await Promise.all([
      this.tripStopRepo
        .createQueryBuilder('s')
        .select('s.tripId', 'tripId')
        .addSelect('s.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('s.tripId IN (:...ids)', { ids })
        .groupBy('s.tripId')
        .addGroupBy('s.status')
        .getRawMany<{ tripId: string; status: string; count: string }>(),
      this.eventRepo
        .createQueryBuilder('e')
        .select('e.tripId', 'tripId')
        .addSelect('COUNT(*)', 'count')
        .where('e.tripId IN (:...ids)', { ids })
        .andWhere("e.type IN ('gps_lost', 'stationary', 'sos')")
        .groupBy('e.tripId')
        .getRawMany<{ tripId: string; count: string }>(),
      this.busRepo.find({ where: { id: In([...new Set(trips.map((x) => x.busId))]) } }),
      this.userRepo.find({ where: { id: In([...new Set(trips.map((x) => x.driverId))]) } }),
    ]);
    const busById = new Map(buses.map((b) => [b.id, b]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const alertsByTrip = new Map(alertRows.map((r) => [r.tripId, Number(r.count)]));
    const countOf = (tripId: string, status: string) =>
      Number(counts.find((c) => c.tripId === tripId && c.status === status)?.count ?? 0);

    return trips.map((trip) => {
      const reached = countOf(trip.id, 'reached');
      const skipped = countOf(trip.id, 'skipped');
      const pending = countOf(trip.id, 'pending');
      const bus = busById.get(trip.busId);
      const driver = driverById.get(trip.driverId);
      return {
        id: trip.id,
        status: trip.status,
        direction: trip.direction,
        routeId: trip.routeId,
        routeName: trip.routeName,
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt?.toISOString() ?? null,
        endReason: trip.endReason,
        durationSec: Math.round(((trip.endedAt ?? new Date()).getTime() - trip.startedAt.getTime()) / 1000),
        distanceM: Math.round(trip.distanceM),
        bus: bus ? { id: bus.id, name: bus.name, plateNumber: bus.plateNumber } : null,
        driver: driver ? { id: driver.id, fullName: driver.fullName } : null,
        stops: { total: reached + skipped + pending, reached, skipped, pending },
        alertsCount: alertsByTrip.get(trip.id) ?? 0,
      };
    });
  }

  /** Parents (students) per route stop: child name, class, parent name + phone. */
  private async studentsByRouteStop(routeStopIds: string[]): Promise<Map<string, StudentInfo[]>> {
    const out = new Map<string, StudentInfo[]>();
    const ids = [...new Set(routeStopIds)];
    if (ids.length === 0) return out;
    const parents = await this.userRepo.find({
      where: { role: Role.PARENT, isActive: true, routeStopId: In(ids) },
      order: { childName: 'ASC' },
    });
    const classIds = [...new Set(parents.map((p) => p.childClassId).filter((x): x is number => x != null))];
    const sectionIds = [...new Set(parents.map((p) => p.childSectionId).filter((x): x is number => x != null))];
    const [classes, sections] = await Promise.all([
      classIds.length ? this.classRepo.find({ where: { id: In(classIds) } }) : Promise.resolve([]),
      sectionIds.length ? this.sectionRepo.find({ where: { id: In(sectionIds) } }) : Promise.resolve([]),
    ]);
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const sectionName = new Map(sections.map((s) => [s.id, s.name]));
    for (const p of parents) {
      if (!p.routeStopId) continue;
      const cls = p.childClassId != null ? className.get(p.childClassId) : undefined;
      const sec = p.childSectionId != null ? sectionName.get(p.childSectionId) : undefined;
      const info: StudentInfo = {
        parentId: p.id,
        parentName: p.fullName,
        parentPhone: p.phone,
        childName: p.childName,
        className: cls ? (sec ? `${cls} - ${sec}` : cls) : null,
      };
      out.set(p.routeStopId, [...(out.get(p.routeStopId) ?? []), info]);
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════

  async settingsFor(schoolId: string): Promise<TrackingSettings> {
    const school = await this.schoolRepo.findOne({ where: { id: schoolId }, select: { id: true, settings: true } });
    return resolveTrackingSettings(school?.settings);
  }

  /** What clients need to age presence and explain radii. */
  publicSettings(s: TrackingSettings) {
    return {
      liveWithinSec: s.liveWithinSec,
      offlineAfterSec: s.offlineAfterSec,
      startRadiusM: s.startRadiusM,
      stopRadiusM: s.stopRadiusM,
      schoolRadiusM: s.schoolRadiusM,
    };
  }

  private async driverBus(driverId: string): Promise<Bus> {
    const link = await this.busDriverRepo.findOne({ where: { driverId, isActive: true } });
    const bus = link ? await this.busRepo.findOne({ where: { id: link.busId, isActive: true } }) : null;
    if (!bus) throw new BadRequestException(t(I18nKey.TRIP.NO_BUS));
    return bus;
  }

  /** Pickup uses the bus route; drop uses the return route if set, else the same route. */
  private async routesForBus(bus: Bus) {
    const pickupId = bus.routeId!;
    const dropId = bus.returnRouteId ?? bus.routeId!;
    const ids = [...new Set([pickupId, dropId])];
    const [routes, stops] = await Promise.all([
      this.routeRepo.find({ where: { id: In(ids) } }),
      this.routeStopRepo.find({ where: { routeId: In(ids) }, order: { stopOrder: 'ASC' } }),
    ]);
    const make = (id: string) => ({
      id,
      name: routes.find((r) => r.id === id)?.name ?? '',
      stops: stops.filter((s) => s.routeId === id),
    });
    return { pickup: make(pickupId), drop: make(dropId) };
  }

  private toEngineStops(stops: TripStop[]): EngineStop[] {
    return stops.map((s) => ({
      id: s.id,
      kind: s.kind,
      seq: s.seq,
      lat: s.lat,
      lng: s.lng,
      status: s.status,
      arrivedAt: s.arrivedAt?.toISOString() ?? null,
    }));
  }

  private normalizeState(raw: Partial<EngineState> | null | undefined): EngineState {
    return { ...initialEngineState(), ...raw, insideCount: { ...raw?.insideCount } };
  }

  /** Live ETA + remaining distance on pending stops; cleared on the rest. */
  private applyEtas(trip: Trip, stops: TripStop[], settings: TrackingSettings) {
    const bus = trip.lastLat != null && trip.lastLng != null ? { lat: trip.lastLat, lng: trip.lastLng } : null;
    const etas = computeEtas(stops, bus, trip.lastSpeedKmh, trip.lastPingAt ?? new Date(), settings);
    for (const s of stops) {
      const e = etas.get(s.id);
      s.etaAt = s.status === 'pending' && e ? e.etaAt : null;
      s.distanceM = s.status === 'pending' && e ? e.distanceM : null;
    }
  }

  /** Mark remaining stops skipped and close the trip (in-memory; caller saves). */
  private markEnded(trip: Trip, stops: TripStop[], reason: TripEndReason, at: Date, events: EventRow[]) {
    for (const s of stops) {
      if (s.status === 'pending') {
        s.status = 'skipped';
        events.push({ type: 'stop_skipped', at, payload: { stopId: s.id, name: s.name, reason } });
      }
      s.etaAt = null;
      s.distanceM = null;
    }
    trip.status = 'completed';
    trip.endedAt = at;
    trip.endReason = reason;
    trip.gpsLostAt = null;
    events.push({ type: 'ended', at, payload: { reason } });
  }

  private async closeInTx(em: EntityManager, trip: Trip, reason: TripEndReason, at: Date) {
    const stops = await em.find(TripStop, { where: { tripId: trip.id }, order: { seq: 'ASC' } });
    const events: EventRow[] = [];
    this.markEnded(trip, stops, reason, at, events);
    await em.save(trip);
    await em.save(stops);
    await this.insertEvents(em, trip.id, events);
  }

  private async insertEvents(em: EntityManager, tripId: string, events: EventRow[]) {
    if (events.length === 0) return;
    const rows = events.map((e) => ({ tripId, type: e.type, at: e.at, payload: e.payload }));
    await em.insert(TripEvent, rows as unknown as QueryDeepPartialEntity<TripEvent>[]);
  }
}
