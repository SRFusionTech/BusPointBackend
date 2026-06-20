import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Route } from './entities/route.entity';
import { RouteStop } from './entities/route-stop.entity';
import { CreateRouteDto, CreateRouteStopDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ReorderStopsDto } from './dto/reorder-stops.dto';

@Injectable()
export class RoutesService {
  constructor(
    @InjectRepository(Route)
    private readonly routeRepo: Repository<Route>,
    @InjectRepository(RouteStop)
    private readonly stopRepo: Repository<RouteStop>,
  ) {}

  async findAllForSchool(schoolId: string): Promise<Route[]> {
    return this.routeRepo.find({
      where: { schoolId },
      relations: ['stops'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Route> {
    const route = await this.routeRepo.findOne({
      where: { id },
      relations: ['stops'],
    });
    if (!route) throw new NotFoundException(`Route ${id} not found`);
    route.stops = (route.stops ?? []).sort((a, b) => a.stopOrder - b.stopOrder);
    return route;
  }

  async findStopById(stopId: string): Promise<RouteStop> {
    const stop = await this.stopRepo.findOneBy({ id: stopId });
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found`);
    return stop;
  }

  async create(dto: CreateRouteDto): Promise<Route> {
    const { stops, ...routeFields } = dto;
    const route = this.routeRepo.create(routeFields);
    const saved = await this.routeRepo.save(route);

    if (stops && stops.length > 0) {
      await this.replaceStops(saved.id, stops);
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateRouteDto): Promise<Route> {
    const route = await this.findOne(id);
    const { stops, ...routeFields } = dto;
    Object.assign(route, routeFields);
    await this.routeRepo.save(route);

    if (stops) {
      await this.replaceStops(id, stops);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const route = await this.findOne(id);
    await this.routeRepo.remove(route);
  }

  async addStop(routeId: string, dto: CreateRouteStopDto): Promise<RouteStop> {
    await this.findOne(routeId);
    const stop = this.stopRepo.create({ ...dto, routeId });
    return this.stopRepo.save(stop);
  }

  async updateStop(stopId: string, dto: Partial<CreateRouteStopDto>): Promise<RouteStop> {
    const stop = await this.stopRepo.findOneBy({ id: stopId });
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found`);
    Object.assign(stop, dto);
    return this.stopRepo.save(stop);
  }

  async removeStop(stopId: string): Promise<void> {
    const stop = await this.stopRepo.findOneBy({ id: stopId });
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found`);
    await this.stopRepo.remove(stop);
  }

  async reorderStops(routeId: string, dto: ReorderStopsDto): Promise<Route> {
    const existing = await this.stopRepo.find({ where: { routeId } });
    const existingIds = new Set(existing.map((s) => s.id));
    if (dto.stopIds.length !== existing.length || !dto.stopIds.every((id) => existingIds.has(id))) {
      throw new BadRequestException(
        'stopIds must contain every stop id on this route, exactly once.',
      );
    }

    await Promise.all(
      dto.stopIds.map((id, idx) => this.stopRepo.update({ id }, { stopOrder: idx })),
    );

    return this.findOne(routeId);
  }

  private async replaceStops(routeId: string, stops: CreateRouteStopDto[]): Promise<void> {
    await this.stopRepo.delete({ routeId });
    if (stops.length === 0) return;
    const entities = stops.map((s, idx) =>
      this.stopRepo.create({
        ...s,
        routeId,
        stopOrder: s.stopOrder ?? idx,
      }),
    );
    await this.stopRepo.save(entities);
  }
}
