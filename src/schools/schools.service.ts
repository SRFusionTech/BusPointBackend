import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { School } from './school.entity';
import { Plan } from '../plans/plan.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { resolveSchoolSettings } from './school-settings';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School)
    private readonly schoolRepo: Repository<School>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.adminEmail.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(t(I18nKey.SCHOOL.ADMIN_EMAIL_EXISTS, { email: dto.adminEmail }));
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    // Create school + admin user in a single transaction
    const result = await this.dataSource.transaction(async (em) => {
      const school = em.create(School, {
        name: dto.name,
        address: dto.address,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        logoUrl: dto.logoUrl ?? null,
        planId: dto.planId ?? null,
      });
      const savedSchool = await em.save(school);

      const admin = em.create(User, {
        email: dto.adminEmail.toLowerCase(),
        passwordHash,
        role: Role.SCHOOL_ADMIN,
        schoolId: savedSchool.id,
        fullName: dto.adminName,
        phone: dto.adminPhone,
      });
      await em.save(admin);

      return savedSchool;
    });

    this.logger.log(`School created: ${result.name} (${result.id})`);

    return successResponse({
      school: {
        id: result.id,
        name: result.name,
        address: result.address,
        logoUrl: result.logoUrl,
      },
      admin: {
        email: dto.adminEmail.toLowerCase(),
        name: dto.adminName,
      },
    }, t(I18nKey.SCHOOL.CREATED));
  }

  async findAll() {
    const schools = await this.schoolRepo.find({
      order: { createdAt: 'DESC' },
    });
    return successResponse(schools);
  }

  async findOne(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));
    return successResponse(school);
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));

    Object.assign(school, dto);
    await this.schoolRepo.save(school);

    this.logger.log(`School updated: ${school.name} (${id})`);
    return successResponse(school, t(I18nKey.SCHOOL.UPDATED));
  }

  async getSettings(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));
    const plans = await this.planRepo.find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
    return successResponse({
      ...resolveSchoolSettings(school.settings),
      planId: school.planId ?? null,
      planExpiresAt: school.planExpiresAt ?? null,
      availablePlans: plans.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    });
  }

  async updateSettings(id: string, dto: UpdateSchoolSettingsDto) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));

    // planId — validate it exists before assigning
    if (dto.planId !== undefined) {
      if (dto.planId !== null) {
        const plan = await this.planRepo.findOne({ where: { id: dto.planId, isActive: true } });
        if (!plan) throw new NotFoundException(t(I18nKey.PLAN.NOT_FOUND));
      }
      school.planId = dto.planId;
    }

    // planExpiresAt is a first-class column, not part of the JSONB settings blob
    if (dto.planExpiresAt !== undefined) {
      school.planExpiresAt = dto.planExpiresAt ? new Date(dto.planExpiresAt) : null;
    }

    // Drop first-class column keys so only SchoolSettings fields go into JSONB
    const { planExpiresAt: _exp, planId: _pid, ...settingsChanges } = dto as Record<string, unknown>;
    const changes = Object.fromEntries(
      Object.entries(settingsChanges).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(changes).length > 0) {
      school.settings = { ...(school.settings ?? {}), ...changes };
    }

    await this.schoolRepo.save(school);

    this.logger.log(`School settings updated: ${school.name} (${id})`);
    return successResponse({
      ...resolveSchoolSettings(school.settings),
      planId: school.planId ?? null,
      planExpiresAt: school.planExpiresAt ?? null,
    }, t(I18nKey.SCHOOL.SETTINGS_SAVED));
  }

  /** The school-admin's own school (branding + location). */
  async findMine(schoolId: string) {
    const school = await this.schoolRepo.findOne({ where: { id: schoolId } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));
    return successResponse({
      id: school.id,
      name: school.name,
      address: school.address,
      logoUrl: school.logoUrl,
      lat: school.lat,
      lng: school.lng,
    });
  }

  /**
   * Backfills the map location for schools created before coordinates were captured.
   * Once set it can't be changed from here — school admins don't move their school.
   */
  async backfillLocation(schoolId: string, lat: number, lng: number) {
    const school = await this.schoolRepo.findOne({ where: { id: schoolId } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));
    if (school.lat !== null && school.lng !== null) {
      throw new ConflictException(t(I18nKey.SCHOOL.LOCATION_ALREADY_SET));
    }
    school.lat = lat;
    school.lng = lng;
    await this.schoolRepo.save(school);
    return successResponse({ lat, lng }, t(I18nKey.SCHOOL.LOCATION_SAVED));
  }

  async remove(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException(t(I18nKey.SCHOOL.NOT_FOUND));

    // Safety check: prevent deleting a school that still has active users
    const activeUsers = await this.userRepo.count({
      where: { schoolId: id, isActive: true },
    });
    if (activeUsers > 0) {
      throw new BadRequestException(
        t(I18nKey.SCHOOL.HAS_ACTIVE_USERS, { count: activeUsers }),
      );
    }

    await this.schoolRepo.remove(school);
    this.logger.log(`School deleted: ${id}`);
    return successResponse(null, t(I18nKey.SCHOOL.DELETED));
  }

  async resetAdminPassword(schoolId: string) {
    const admin = await this.userRepo.findOne({
      where: { schoolId, role: Role.SCHOOL_ADMIN, isActive: true },
    });
    if (!admin) {
      throw new NotFoundException(t(I18nKey.SCHOOL.ADMIN_NOT_FOUND));
    }

    const tempPassword = this.generatePassword();
    admin.passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.userRepo.save(admin);

    this.logger.log(`Password reset for school admin: ${admin.email}`);

    // Return plaintext once — caller must show it to the super admin immediately
    return successResponse(
      { email: admin.email, tempPassword },
      t(I18nKey.SCHOOL.ADMIN_PASSWORD_RESET),
    );
  }

  /** Generates a strong readable temp password: Word + 4 digits + symbol */
  private generatePassword(): string {
    const words = ['School', 'Admin', 'BusPoint', 'Access', 'Portal'];
    const word = words[Math.floor(Math.random() * words.length)];
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const symbols = ['@', '#', '!', '$'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    return `${word}${digits}${symbol}`;
  }
}
