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
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

/** Phone is the login for these roles, so it must be unique across them (matches the users phone index). */
const PHONE_LOGIN_ROLES = [Role.DRIVER, Role.PARENT];

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
      where: { phone: dto.phone, role: In(PHONE_LOGIN_ROLES) },
    });
    if (existing) {
      throw new ConflictException(
        t(existing.role === Role.PARENT ? I18nKey.DRIVER.PHONE_TAKEN_PARENT : I18nKey.DRIVER.PHONE_TAKEN_DRIVER, { phone: dto.phone }),
      );
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
      t(I18nKey.DRIVER.CREATED),
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
    if (!driver) throw new NotFoundException(t(I18nKey.DRIVER.NOT_FOUND));
    return successResponse(driver);
  }

  async update(schoolId: string, id: string, dto: UpdateDriverDto) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException(t(I18nKey.DRIVER.NOT_FOUND));

    if (dto.phone && dto.phone !== driver.phone) {
      const conflict = await this.userRepo.findOne({
        where: { phone: dto.phone, role: In(PHONE_LOGIN_ROLES) },
      });
      if (conflict) {
        throw new ConflictException(
          t(conflict.role === Role.PARENT ? I18nKey.DRIVER.PHONE_TAKEN_PARENT : I18nKey.DRIVER.PHONE_TAKEN_DRIVER, { phone: dto.phone }),
        );
      }
    }

    Object.assign(driver, dto);
    await this.userRepo.save(driver);
    return successResponse(
      { id: driver.id, fullName: driver.fullName, phone: driver.phone, isActive: driver.isActive },
      t(I18nKey.DRIVER.UPDATED),
    );
  }

  async resetPassword(schoolId: string, id: string) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException(t(I18nKey.DRIVER.NOT_FOUND));

    const tempPassword = this.generatePassword();
    driver.passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.userRepo.save(driver);

    this.logger.log(`Password reset for driver: ${driver.fullName} (${id})`);
    return successResponse(
      { tempPassword },
      t(I18nKey.DRIVER.PASSWORD_RESET),
    );
  }

  async remove(schoolId: string, id: string) {
    const driver = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.DRIVER },
    });
    if (!driver) throw new NotFoundException(t(I18nKey.DRIVER.NOT_FOUND));

    driver.isActive = false;
    await this.userRepo.save(driver);
    await this.busDriverRepo.update({ driverId: id, isActive: true }, { isActive: false });
    return successResponse(null, t(I18nKey.DRIVER.DEACTIVATED));
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
