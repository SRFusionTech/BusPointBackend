import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { School } from '../schools/entities/school.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { AccessRequest, RequestStatus } from './access-request.entity';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(School)       private readonly schoolRepo: Repository<School>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Bus)          private readonly busRepo: Repository<Bus>,
    @InjectRepository(AccessRequest) private readonly requestRepo: Repository<AccessRequest>,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const expectedEmail  = this.configService.get<string>('SUPER_ADMIN_EMAIL') ?? 'superadmin@buspoint.app';
    const passwordHash   = this.configService.get<string>('SUPER_ADMIN_PASSWORD_HASH') ?? '';
    if (email !== expectedEmail)              throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid)                               throw new UnauthorizedException('Invalid credentials');
    const secret = this.configService.get<string>('SUPER_ADMIN_JWT_SECRET') ?? 'superadmin-secret-change-in-prod';
    const token  = this.jwtService.sign({ sub: 'super-admin-1', email, role: 'SUPER_ADMIN' }, { secret, expiresIn: '12h' });
    return { access_token: token };
  }

  // ── Platform stats ────────────────────────────────────────────────────────

  async getPlatformStats() {
    const [schools, users, buses, pendingRequests] = await Promise.all([
      this.schoolRepo.count(),
      this.userRepo.count(),
      this.busRepo.count(),
      this.requestRepo.count({ where: { status: RequestStatus.PENDING } }),
    ]);
    return { schools, users, buses, pendingRequests };
  }

  // ── Schools ───────────────────────────────────────────────────────────────

  async listSchools() {
    const schools = await this.schoolRepo.find({ order: { createdAt: 'DESC' } });
    const enriched = await Promise.all(
      schools.map(async (s) => {
        const [users, buses, admin] = await Promise.all([
          this.userRepo.count({ where: { schoolId: s.id } }),
          this.busRepo.count({ where: { schoolId: s.id } }),
          this.userRepo.findOne({ where: { schoolId: s.id, role: UserRole.ADMIN } }),
        ]);
        const activeUsers = await this.userRepo.count({ where: { schoolId: s.id, isActive: true } });
        return {
          ...s,
          userCount:  users,
          busCount:   buses,
          activeUsers,
          suspended:  activeUsers === 0 && users > 0,
          adminEmail: admin?.email ?? null,
          adminName:  admin?.name  ?? null,
        };
      }),
    );
    return enriched;
  }

  async getSchoolDetail(schoolId: string) {
    const school = await this.schoolRepo.findOneBy({ id: schoolId });
    if (!school) throw new BadRequestException('School not found');
    const [users, buses, admin] = await Promise.all([
      this.userRepo.find({ where: { schoolId } }),
      this.busRepo.find({ where: { schoolId } }),
      this.userRepo.findOne({ where: { schoolId, role: UserRole.ADMIN } }),
    ]);
    return {
      school,
      admin:   admin ? { name: admin.name, email: admin.email, phone: admin.phone, isActive: admin.isActive } : null,
      stats: {
        totalUsers:  users.length,
        admins:      users.filter((u) => u.role === UserRole.ADMIN).length,
        drivers:     users.filter((u) => u.role === UserRole.DRIVER).length,
        parents:     users.filter((u) => u.role === UserRole.PARENT).length,
        activeUsers: users.filter((u) => u.isActive).length,
        totalBuses:  buses.length,
        activeBuses: buses.filter((b) => b.status === 'started' || b.status === 'returning').length,
      },
      recentUsers: users.slice(0, 5).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive })),
    };
  }

  async provisionSchool(dto: {
    schoolName: string;
    location: string;
    adminEmail: string;
    adminName: string;
    adminPassword: string;
  }) {
    const existing = await this.schoolRepo.findOneBy({ name: dto.schoolName });
    if (existing) throw new BadRequestException('A school with this name already exists');
    const existingUser = await this.userRepo.findOneBy({ email: dto.adminEmail });
    if (existingUser) throw new BadRequestException('A user with this email already exists');

    const school = await this.schoolRepo.save(
      this.schoolRepo.create({ name: dto.schoolName, location: dto.location }),
    );
    const [firstName, ...rest] = dto.adminName.split(' ');
    const lastName    = rest.join(' ') || 'Admin';
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const admin = await this.userRepo.save(
      this.userRepo.create({
        email: dto.adminEmail, firstName, lastName,
        name: dto.adminName, phone: null,
        role: UserRole.ADMIN, schoolId: school.id, passwordHash,
      }),
    );
    return { school, admin: { id: admin.id, email: admin.email, name: admin.name } };
  }

  async suspendSchool(schoolId: string) {
    const school = await this.schoolRepo.findOneBy({ id: schoolId });
    if (!school) throw new BadRequestException('School not found');
    await this.userRepo.update({ schoolId }, { isActive: false });
    return { message: `School "${school.name}" suspended successfully.` };
  }

  async reinstateSchool(schoolId: string) {
    const school = await this.schoolRepo.findOneBy({ id: schoolId });
    if (!school) throw new BadRequestException('School not found');
    await this.userRepo.update({ schoolId }, { isActive: true });
    return { message: `School "${school.name}" reinstated successfully.` };
  }

  async deleteSchool(schoolId: string) {
    const school = await this.schoolRepo.findOneBy({ id: schoolId });
    if (!school) throw new BadRequestException('School not found');
    // Delete users manually first (no FK cascade on users.schoolId).
    // Buses, bus_drivers, and school_users cascade via DB FK constraints.
    await this.userRepo.delete({ schoolId });
    await this.schoolRepo.delete(schoolId);
    return { message: `School "${school.name}" permanently deleted.` };
  }

  // ── Access Requests ───────────────────────────────────────────────────────

  async createAccessRequest(dto: { name: string; schoolName: string; phone: string; plan?: string }) {
    const req = await this.requestRepo.save(this.requestRepo.create(dto));
    return req;
  }

  async listAccessRequests(status?: RequestStatus) {
    const where = status ? { status } : {};
    return this.requestRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async approveRequest(id: string, provisionDto: { adminEmail: string; adminPassword: string; location: string }) {
    const req = await this.requestRepo.findOneBy({ id });
    if (!req) throw new BadRequestException('Request not found');
    if (req.status !== RequestStatus.PENDING) throw new BadRequestException('Request already processed');

    const result = await this.provisionSchool({
      schoolName:    req.schoolName,
      location:      provisionDto.location,
      adminEmail:    provisionDto.adminEmail,
      adminName:     req.name,
      adminPassword: provisionDto.adminPassword,
    });
    await this.requestRepo.update(id, {
      status: RequestStatus.APPROVED,
      provisionedSchoolId: result.school.id,
    });
    return { ...result, request: req };
  }

  async rejectRequest(id: string, reason?: string) {
    const req = await this.requestRepo.findOneBy({ id });
    if (!req) throw new BadRequestException('Request not found');
    await this.requestRepo.update(id, { status: RequestStatus.REJECTED, rejectionReason: reason });
    return { message: 'Request rejected.' };
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async changePassword(currentPassword: string, newPassword: string) {
    const passwordHash = this.configService.get<string>('SUPER_ADMIN_PASSWORD_HASH') ?? '';
    const valid = await bcrypt.compare(currentPassword, passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const newHash = await bcrypt.hash(newPassword, 10);
    // In production this would update the DB. For now return the new hash to update .env manually.
    return { message: 'Password changed. Update SUPER_ADMIN_PASSWORD_HASH in .env with the value below.', newHash };
  }
}
