import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusDriver } from './entities/bus-driver.entity';
import { Bus } from '../buses/entities/bus.entity';
import { User } from '../users/entities/user.entity';
import { CreateBusDriverDto } from './dto/create-bus-driver.dto';
import { UpdateBusDriverDto } from './dto/update-bus-driver.dto';

@Injectable()
export class BusDriversService {
  constructor(
    @InjectRepository(BusDriver)
    private readonly busDriverRepository: Repository<BusDriver>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async assign(createBusDriverDto: CreateBusDriverDto): Promise<BusDriver> {
    // If the bus already has an active driver, unassign them first
    const activeAssignment = await this.busDriverRepository.findOneBy({
      busId: createBusDriverDto.busId,
      isActive: true,
    });
    if (activeAssignment) {
      activeAssignment.isActive = false;
      activeAssignment.unassignedAt = new Date();
      await this.busDriverRepository.save(activeAssignment);

      await this.userRepository
        .createQueryBuilder()
        .update()
        .set({ busId: null as any })
        .where('id = :id', { id: activeAssignment.driverId })
        .execute();
    }

    const assignment = this.busDriverRepository.create(createBusDriverDto);
    const saved = await this.busDriverRepository.save(assignment);

    // Keep denormalized bus.driverId in sync (use QueryBuilder for reliable column mapping)
    await this.busRepository
      .createQueryBuilder()
      .update()
      .set({ driverId: createBusDriverDto.driverId })
      .where('id = :id', { id: createBusDriverDto.busId })
      .execute();

    await this.userRepository
      .createQueryBuilder()
      .update()
      .set({ busId: createBusDriverDto.busId })
      .where('id = :id', { id: createBusDriverDto.driverId })
      .execute();

    return saved;
  }

  // Unassign the current active driver from a bus
  async unassign(busId: string): Promise<BusDriver> {
    const assignment = await this.busDriverRepository.findOneBy({
      busId,
      isActive: true,
    });
    if (!assignment) {
      throw new NotFoundException('No active driver assignment found for this bus');
    }
    assignment.isActive = false;
    assignment.unassignedAt = new Date();
    const saved = await this.busDriverRepository.save(assignment);

    // Clear denormalized bus.driverId (use QueryBuilder for reliable column mapping)
    await this.busRepository
      .createQueryBuilder()
      .update()
      .set({ driverId: null as any })
      .where('id = :id', { id: busId })
      .execute();

    await this.userRepository
      .createQueryBuilder()
      .update()
      .set({ busId: null as any })
      .where('id = :id', { id: assignment.driverId })
      .execute();

    return saved;
  }

  // Get the current active driver for a bus
  async getActiveDriver(busId: string): Promise<BusDriver | null> {
    return this.busDriverRepository.findOneBy({ busId, isActive: true });
  }

  // Full assignment history for a bus
  getHistoryByBus(busId: string): Promise<BusDriver[]> {
    return this.busDriverRepository.find({
      where: { busId },
      order: { assignedAt: 'DESC' },
    });
  }

  // All buses ever assigned to a driver
  getHistoryByDriver(driverId: string): Promise<BusDriver[]> {
    return this.busDriverRepository.find({
      where: { driverId },
      order: { assignedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<BusDriver> {
    const assignment = await this.busDriverRepository.findOneBy({ id });
    if (!assignment) {
      throw new NotFoundException(`Assignment with id ${id} not found`);
    }
    return assignment;
  }

  async update(id: string, updateBusDriverDto: UpdateBusDriverDto): Promise<BusDriver> {
    const assignment = await this.findOne(id);
    Object.assign(assignment, updateBusDriverDto);
    return this.busDriverRepository.save(assignment);
  }

  async remove(id: string): Promise<void> {
    const assignment = await this.findOne(id);
    await this.busDriverRepository.remove(assignment);
  }
}
