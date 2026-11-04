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
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { resolveSchoolSettings } from './school-settings';
import { successResponse } from '../common/response/api-response';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School)
    private readonly schoolRepo: Repository<School>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.adminEmail.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(`An account with email ${dto.adminEmail} already exists.`);
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    // Create school + admin user in a single transaction
    const result = await this.dataSource.transaction(async (em) => {
      const school = em.create(School, {
        name: dto.name,
        address: dto.address,
        logoUrl: dto.logoUrl ?? null,
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
    }, 'School created successfully.');
  }

  async findAll() {
    const schools = await this.schoolRepo.find({
      order: { createdAt: 'DESC' },
    });
    return successResponse(schools);
  }

  async findOne(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found.');
    return successResponse(school);
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found.');

    Object.assign(school, dto);
    await this.schoolRepo.save(school);

    this.logger.log(`School updated: ${school.name} (${id})`);
    return successResponse(school, 'School updated successfully.');
  }

  async getSettings(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found.');
    return successResponse(resolveSchoolSettings(school.settings));
  }

  async updateSettings(id: string, dto: UpdateSchoolSettingsDto) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found.');

    // Drop undefined keys so a partial PATCH never erases stored values
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    school.settings = { ...(school.settings ?? {}), ...changes };
    await this.schoolRepo.save(school);

    this.logger.log(`School settings updated: ${school.name} (${id}) ${JSON.stringify(changes)}`);
    return successResponse(resolveSchoolSettings(school.settings), 'Settings saved.');
  }

  async remove(id: string) {
    const school = await this.schoolRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found.');

    // Safety check: prevent deleting a school that still has active users
    const activeUsers = await this.userRepo.count({
      where: { schoolId: id, isActive: true },
    });
    if (activeUsers > 0) {
      throw new BadRequestException(
        `Cannot delete school with ${activeUsers} active user(s). Deactivate all users first.`,
      );
    }

    await this.schoolRepo.remove(school);
    this.logger.log(`School deleted: ${id}`);
    return successResponse(null, 'School deleted successfully.');
  }

  async resetAdminPassword(schoolId: string) {
    const admin = await this.userRepo.findOne({
      where: { schoolId, role: Role.SCHOOL_ADMIN, isActive: true },
    });
    if (!admin) {
      throw new NotFoundException('School admin not found for this school.');
    }

    const tempPassword = this.generatePassword();
    admin.passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.userRepo.save(admin);

    this.logger.log(`Password reset for school admin: ${admin.email}`);

    // Return plaintext once — caller must show it to the super admin immediately
    return successResponse(
      { email: admin.email, tempPassword },
      'Password reset successfully. Share this password with the school admin.',
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
