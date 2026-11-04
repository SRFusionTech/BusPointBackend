import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { Bus } from '../buses/bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { Role } from '../common/enums/role.enum';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { successResponse } from '../common/response/api-response';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepo: Repository<BusDriver>,
  ) {}

  async create(schoolId: string, dto: CreateDriverDto) {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.phone, role: Role.DRIVER },
    });
    if (existing) {
      throw new ConflictException(`A driver with phone number ${dto.phone} already exists.`);
    }

    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const driver = this.userRepo.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: null,
      passwordHash,
      role: Role.DRIVER,
      schoolId,
    });
    const saved = await this.userRepo.save(driver);

    this.logger.log(`Driver created: ${saved.fullName} (${saved.id}) for school ${schoolId}`);

    return successResponse(
      {
        id: saved.id,
        fullName: saved.fullName,
        phone: saved.phone,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
        tempPassword,
      },
      'Driver created successfully.',
    );
  }

  async findAll(schoolId: string) {
    const drivers = await this.userRepo.find({
      where: { schoolId, role: Role.DRIVER },
      order: { createdAt: 'DESC' },
      select: { id: true, fullName: true, phone: true, isActive: true, createdAt: true },
    });
    if (drivers.length === 0) return successResponse([]);

    const assignments = await this.busDriverRepo.find({
      where: { driverId: In(drivers.map((d) => d.id)), isActive: true },
    });
    const buses = assignments.length
      ? await this.busRepo.find({
          where: { id: In(assignments.map((a) => a.busId)), isActive: true },
          select: { id: true, name: true, plateNumber: true },
        })
      : [];
    const busById = new Map(buses.map((b) => [b.id, b]));
    const busByDriver = new Map(assignments.map((a) => [a.driverId, busById.get(a.busId) ?? null]));

    return successResponse(drivers.map((d) => ({ ...d, bus: busByDriver.get(d.id) ?? null })));
  }

  async findOne(schoolId: string, id: string) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
      select: { id: true, fullName: true, phone: true, isActive: true, createdAt: true, updatedAt: true },
    });
    if (!driver) throw new NotFoundException('Driver not found.');
    return successResponse(driver);
  }

  async update(schoolId: string, id: string, dto: UpdateDriverDto) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException('Driver not found.');

    if (dto.phone && dto.phone !== driver.phone) {
      const conflict = await this.userRepo.findOne({
        where: { phone: dto.phone, role: Role.DRIVER },
      });
      if (conflict) {
        throw new ConflictException(`Phone number ${dto.phone} is already in use.`);
      }
    }

    Object.assign(driver, dto);
    await this.userRepo.save(driver);
    return successResponse(
      { id: driver.id, fullName: driver.fullName, phone: driver.phone, isActive: driver.isActive },
      'Driver updated successfully.',
    );
  }

  async resetPassword(schoolId: string, id: string) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException('Driver not found.');

    const tempPassword = this.generatePassword();
    driver.passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.userRepo.save(driver);

    this.logger.log(`Password reset for driver: ${driver.fullName} (${id})`);
    return successResponse(
      { tempPassword },
      'Password reset successfully. Share this password with the driver.',
    );
  }

  async remove(schoolId: string, id: string) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException('Driver not found.');

    driver.isActive = false;
    await this.userRepo.save(driver);
    await this.busDriverRepo.update({ driverId: id, isActive: true }, { isActive: false });
    return successResponse(null, 'Driver deactivated successfully.');
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
