import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Bus } from './bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { User } from '../users/user.entity';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { successResponse } from '../common/response/api-response';

@Injectable()
export class BusesService {
  private readonly logger = new Logger(BusesService.name);

  constructor(
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(schoolId: string, dto: CreateBusDto) {
    const existing = await this.busRepo.findOne({
      where: { plateNumber: dto.plateNumber },
    });
    if (existing) {
      throw new ConflictException(`A bus with plate number "${dto.plateNumber}" already exists.`);
    }

    const bus = this.busRepo.create({
      ...dto,
      schoolId,
      make: dto.make ?? null,
      model: dto.model ?? null,
      capacity: dto.capacity ?? null,
      routeId: dto.routeId ?? null,
      returnRouteId: dto.returnRouteId ?? null,
    });
    const saved = await this.busRepo.save(bus);

    this.logger.log(`Bus created: ${saved.name} (${saved.id}) for school ${schoolId}`);
    return successResponse({ ...saved, driver: null }, 'Bus created successfully.');
  }

  async findAll(schoolId: string) {
    const buses = await this.busRepo.find({
      where: { schoolId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (buses.length === 0) return successResponse([]);

    const assignments = await this.busDriverRepo.find({
      where: { busId: In(buses.map((b) => b.id)), isActive: true },
    });
    const drivers = assignments.length
      ? await this.userRepo.find({
          where: { id: In(assignments.map((a) => a.driverId)) },
          select: { id: true, fullName: true, phone: true },
        })
      : [];
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const driverByBus = new Map(assignments.map((a) => [a.busId, driverById.get(a.driverId) ?? null]));

    return successResponse(buses.map((b) => ({ ...b, driver: driverByBus.get(b.id) ?? null })));
  }

  async findOne(schoolId: string, id: string) {
    const bus = await this.busRepo.findOne({ where: { id, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');
    return successResponse(bus);
  }

  async update(schoolId: string, id: string, dto: UpdateBusDto) {
    const bus = await this.busRepo.findOne({ where: { id, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');

    if (dto.plateNumber && dto.plateNumber !== bus.plateNumber) {
      const conflict = await this.busRepo.findOne({ where: { plateNumber: dto.plateNumber } });
      if (conflict) {
        throw new ConflictException(`Plate number "${dto.plateNumber}" is already in use.`);
      }
    }

    Object.assign(bus, dto);
    const saved = await this.busRepo.save(bus);

    this.logger.log(`Bus updated: ${saved.name} (${id})`);
    return successResponse(saved, 'Bus updated successfully.');
  }

  async remove(schoolId: string, id: string) {
    const bus = await this.busRepo.findOne({ where: { id, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');

    bus.isActive = false;
    await this.busRepo.save(bus);
    // Free the driver so they can be assigned to another bus
    await this.busDriverRepo.update({ busId: id, isActive: true }, { isActive: false });

    this.logger.log(`Bus deactivated: ${bus.name} (${id})`);
    return successResponse(null, 'Bus removed successfully.');
  }
}
