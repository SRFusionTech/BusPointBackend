import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Route } from './route.entity';
import { LAST_STOP_NAME, RouteStop } from './route-stop.entity';
import { Bus } from '../buses/bus.entity';
import { School } from '../schools/school.entity';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { BulkStopsDto } from './dto/bulk-stops.dto';
import { successResponse } from '../common/response/api-response';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @InjectRepository(Route)
    private readonly routeRepo: Repository<Route>,
    @InjectRepository(RouteStop)
    private readonly stopRepo: Repository<RouteStop>,
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(School)
    private readonly schoolRepo: Repository<School>,
    private readonly dataSource: DataSource,
  ) {}

  async create(schoolId: string, dto: CreateRouteDto) {
    const route = this.routeRepo.create({ name: dto.name, schoolId });
    const saved = await this.routeRepo.save(route);
    this.logger.log(`Route created: ${saved.name} (${saved.id})`);
    return successResponse(saved, 'Route created successfully.');
  }

  async findAll(schoolId: string) {
    const routes = await this.routeRepo.find({
      where: { schoolId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (routes.length === 0) return successResponse([]);

    const stopRows: { routeId: string; count: string }[] = await this.stopRepo
      .createQueryBuilder('s')
      .select('s.routeId', 'routeId')
      .addSelect('COUNT(*)', 'count')
      .where('s.routeId IN (:...ids)', { ids: routes.map((r) => r.id) })
      .andWhere("s.kind <> 'school'") // count pickups, not the school itself
      .groupBy('s.routeId')
      .getRawMany();
    const busRows: { routeId: string; count: string }[] = await this.busRepo
      .createQueryBuilder('b')
      .select('b.routeId', 'routeId')
      .addSelect('COUNT(*)', 'count')
      .where('b.schoolId = :schoolId', { schoolId })
      .andWhere('b.isActive = true')
      .andWhere('b.routeId IS NOT NULL')
      .groupBy('b.routeId')
      .getRawMany();

    const stopCounts = new Map(stopRows.map((r) => [r.routeId, Number(r.count)]));
    const busCounts = new Map(busRows.map((r) => [r.routeId, Number(r.count)]));

    return successResponse(routes.map((r) => ({
      ...r,
      stopCount: stopCounts.get(r.id) ?? 0,
      busCount: busCounts.get(r.id) ?? 0,
    })));
  }

  async findOne(schoolId: string, id: string) {
    const route = await this.routeRepo.findOne({
      where: { id, schoolId },
      relations: { stops: true },
    });
    if (!route) throw new NotFoundException('Route not found.');

    route.stops = route.stops.sort((a, b) => a.stopOrder - b.stopOrder);
    return successResponse(route);
  }

  async update(schoolId: string, id: string, dto: UpdateRouteDto) {
    const route = await this.routeRepo.findOne({ where: { id, schoolId } });
    if (!route) throw new NotFoundException('Route not found.');

    Object.assign(route, dto);
    const saved = await this.routeRepo.save(route);
    return successResponse(saved, 'Route updated successfully.');
  }

  async remove(schoolId: string, id: string) {
    const route = await this.routeRepo.findOne({ where: { id, schoolId } });
    if (!route) throw new NotFoundException('Route not found.');

    route.isActive = false;
    await this.routeRepo.save(route);
    await this.busRepo.update({ schoolId, routeId: id }, { routeId: null });
    await this.busRepo.update({ schoolId, returnRouteId: id }, { returnRouteId: null });
    return successResponse(null, 'Route removed successfully.');
  }

  /**
   * Replaces all stops. Order is always: school (from the school's own location) →
   * pickups as sent → "Last Stop". Clients can't move or rename the two fixed ends.
   */
  async bulkReplaceStops(schoolId: string, routeId: string, dto: BulkStopsDto) {
    const route = await this.routeRepo.findOne({ where: { id: routeId, schoolId } });
    if (!route) throw new NotFoundException('Route not found.');

    const school = await this.schoolRepo.findOne({ where: { id: schoolId } });
    if (!school || school.lat === null || school.lng === null) {
      throw new BadRequestException('Your school has no map location yet, so routes can’t start from it. Contact BusPoint support.');
    }

    const rows: Partial<RouteStop>[] = [
      { kind: 'school', name: school.name, lat: school.lat, lng: school.lng, address: school.address },
      ...dto.stops.map((s) => ({
        kind: 'stop' as const, name: s.name.trim(), lat: s.lat, lng: s.lng, address: s.address ?? null,
      })),
      ...(dto.end
        ? [{ kind: 'end' as const, name: LAST_STOP_NAME, lat: dto.end.lat, lng: dto.end.lng, address: dto.end.address ?? null }]
        : []),
    ];

    await this.dataSource.transaction(async (em) => {
      await em.delete(RouteStop, { routeId });
      await em.save(rows.map((r, i) => em.create(RouteStop, { ...r, routeId, stopOrder: i })));
    });

    const updated = await this.stopRepo.find({ where: { routeId }, order: { stopOrder: 'ASC' } });
    this.logger.log(`Route ${routeId}: saved ${rows.length} stops`);
    return successResponse(updated, 'Route saved.');
  }
}
