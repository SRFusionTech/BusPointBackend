import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusDriver } from './bus-driver.entity';
import { Bus } from '../buses/bus.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { successResponse } from '../common/response/api-response';

@Injectable()
export class BusDriversService {
  private readonly logger = new Logger(BusDriversService.name);

  constructor(
    @InjectRepository(BusDriver)
    private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async assign(schoolId: string, busId: string, dto: AssignDriverDto) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');

    const driver = await this.userRepo.findOne({
      where: { id: dto.driverId, schoolId, role: Role.DRIVER, isActive: true },
    });
    if (!driver) throw new NotFoundException('Driver not found.');

    // Check driver is not already assigned to another active bus
    const existingForDriver = await this.busDriverRepo.findOne({
      where: { driverId: dto.driverId, isActive: true },
    });
    if (existingForDriver && existingForDriver.busId !== busId) {
      throw new BadRequestException('Driver is already assigned to another bus. Unassign them first.');
    }

    // Deactivate any current driver on this bus
    await this.busDriverRepo.update({ busId, isActive: true }, { isActive: false });

    const assignment = this.busDriverRepo.create({ busId, driverId: dto.driverId });
    const saved = await this.busDriverRepo.save(assignment);

    this.logger.log(`Driver ${dto.driverId} assigned to bus ${busId}`);
    return successResponse(
      { id: saved.id, busId, driverId: dto.driverId, assignedAt: saved.assignedAt },
      'Driver assigned successfully.',
    );
  }

  async unassign(schoolId: string, busId: string) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');

    await this.busDriverRepo.update({ busId, isActive: true }, { isActive: false });
    return successResponse(null, 'Driver unassigned successfully.');
  }

  async getCurrentDriver(schoolId: string, busId: string) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException('Bus not found.');

    const assignment = await this.busDriverRepo.findOne({
      where: { busId, isActive: true },
    });
    if (!assignment) {
      return successResponse(null, 'No driver assigned to this bus.');
    }

    const driver = await this.userRepo.findOne({
      where: { id: assignment.driverId },
      select: { id: true, fullName: true, phone: true, isActive: true },
    });
    return successResponse({ ...assignment, driver });
  }
}
