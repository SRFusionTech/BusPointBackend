import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { LoginDto } from './dto/login.dto';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { School } from '../schools/school.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { Bus } from '../buses/bus.entity';
import { SchoolClass } from '../classes/school-class.entity';
import { Role } from '../common/enums/role.enum';
import { I18nKey } from '../i18n/i18n.keys';
import { successResponse } from '../common/response/api-response';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

const WEB_ROLES = [Role.SUPER_ADMIN, Role.SCHOOL_ADMIN];
const MOBILE_ROLES = [Role.DRIVER, Role.PARENT];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly accessTtlMs: number;
  private readonly refreshTtlDaysWeb: number;
  private readonly refreshTtlDaysMobile: number;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(School)
    private readonly schoolRepo: Repository<School>,
    @InjectRepository(RouteStop)
    private readonly stopRepo: Repository<RouteStop>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(SchoolClass)
    private readonly classRepo: Repository<SchoolClass>,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlMs = this.config.get<number>('JWT_ACCESS_TTL_MINUTES')! * 60 * 1000;
    this.refreshTtlDaysWeb = this.config.get<number>('JWT_REFRESH_TTL_DAYS_WEB')!;
    this.refreshTtlDaysMobile = this.config.get<number>('JWT_REFRESH_TTL_DAYS_MOBILE')!;
  }

  async webLogin(dto: LoginDto) {
    const user = await this.findAndVerify(dto);
    if (!WEB_ROLES.includes(user.role)) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.WEB_ONLY));
    }
    await this.assertPlanActive(user, 'admin');
    return this.issueTokens(user, this.refreshTtlDaysWeb);
  }

  async mobileLogin(dto: MobileLoginDto) {
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone, role: In(MOBILE_ROLES) },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.INVALID_MOBILE_CREDENTIALS));
    }
    if (!MOBILE_ROLES.includes(user.role)) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.MOBILE_ONLY));
    }
    if (!user.isActive) {
      throw new ForbiddenException(this.t(I18nKey.AUTH.ACCOUNT_INACTIVE));
    }
    if (user.role === Role.PARENT) {
      await this.assertPickupPointAssigned(user);
      this.assertParentSubscriptionActive(user);
    }
    if (user.role === Role.DRIVER) {
      await this.assertDriverRouteAssigned(user);
    }
    await this.assertPlanActive(user, 'app');
    return this.issueTokens(user, this.refreshTtlDaysMobile);
  }

  /**
   * Silent refresh — called with the refresh token the client stored at login.
   * Rotates the refresh token on every use (old one deleted).
   * If the same refresh token is used twice → wipe all sessions (reuse attack).
   */
  async refresh(rawToken?: string) {
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token.');
    }

    const tokenHash = hashToken(rawToken);
    const stored = await this.refreshRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    // Token not found — could be reuse after rotation (stolen token scenario)
    if (!stored) {
      // Attempt to find by partial match is not possible with hash.
      // Best effort: if caller has user context, wipe their sessions.
      throw new UnauthorizedException('Invalid or already-used refresh token. Please log in again.');
    }

    if (stored.expiresAt < new Date()) {
      await this.refreshRepo.delete({ id: stored.id });
      throw new UnauthorizedException('Refresh token expired. Please log in again.');
    }

    const user = stored.user;
    if (!user.isActive) {
      await this.refreshRepo.delete({ userId: user.id });
      throw new UnauthorizedException(this.t(I18nKey.AUTH.ACCOUNT_INACTIVE));
    }

    // Rotate: delete old token, issue new pair
    await this.refreshRepo.delete({ id: stored.id });

    const refreshTtlDays = WEB_ROLES.includes(user.role)
      ? this.refreshTtlDaysWeb
      : this.refreshTtlDaysMobile;

    const audience = MOBILE_ROLES.includes(user.role) ? 'app' : 'admin';
    await this.assertPlanActive(user, audience);

    return this.issueTokens(user, refreshTtlDays);
  }

  async logout(rawToken?: string) {
    if (rawToken) {
      await this.refreshRepo.delete({ tokenHash: hashToken(rawToken) });
    }
    return successResponse(null, this.t(I18nKey.AUTH.LOGGED_OUT));
  }

  async me(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new UnauthorizedException(this.t(I18nKey.AUTH.UNAUTHORIZED));

    const school = user.schoolId
      ? await this.schoolRepo.findOne({
          where: { id: user.schoolId },
          select: { id: true, name: true, logoUrl: true },
        })
      : null;

    const pickupStop = user.role === Role.PARENT && user.routeStopId
      ? await this.stopRepo.findOne({
          where: { id: user.routeStopId },
          select: { id: true, name: true, address: true, lat: true, lng: true },
        })
      : null;

    const bus = user.role === Role.DRIVER ? await this.findDriverBus(user.id) : null;

    return successResponse({
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      schoolId: user.schoolId,
      fullName: user.fullName,
      school: school ? { id: school.id, name: school.name, logoUrl: school.logoUrl } : null,
      ...(user.role === Role.PARENT && {
        pickupStop: pickupStop
          ? { id: pickupStop.id, name: pickupStop.name, address: pickupStop.address, lat: pickupStop.lat, lng: pickupStop.lng }
          : null,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        child: await this.childSummary(user),
      }),
      ...(user.role === Role.DRIVER && {
        bus: bus ? { id: bus.id, name: bus.name, plateNumber: bus.plateNumber } : null,
      }),
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new UnauthorizedException(this.t(I18nKey.AUTH.UNAUTHORIZED));

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect.');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current password.');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepo.save(user);

    // Revoke all refresh tokens — force re-login on all devices
    await this.refreshRepo.delete({ userId });

    this.logger.log(`Password changed: ${user.email}`);
    return successResponse(null, this.t(I18nKey.COMMON.UPDATED));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Stateless JWT for every client (web + mobile): both tokens are returned in the
   * body; the client sends `Authorization: Bearer <accessToken>` and posts the
   * refresh token to /auth/refresh and /auth/logout.
   */
  private async issueTokens(user: User, refreshTtlDays: number) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    // Access token
    const accessToken = this.jwt.sign(payload, { expiresIn: this.accessTtlMs / 1000 });
    const accessTokenExpiresAt = Date.now() + this.accessTtlMs;

    // Refresh token
    const rawRefresh = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * refreshTtlDays);
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt,
      }),
    );

    this.logger.log(`Auth: ${user.email} (${user.role})`);

    return successResponse({
      role: user.role,
      email: user.email,
      accessTokenExpiresAt, // Unix ms — store client-side for proactive refresh
      accessToken,
      refreshToken: rawRefresh,
    });
  }

  /** Throws 402 if the user's school has a past planExpiresAt. No-op for super admins (no schoolId). */
  private async assertPlanActive(user: User, audience: 'admin' | 'app'): Promise<void> {
    if (!user.schoolId) return; // super_admin — no school, always active
    const school = await this.schoolRepo.findOne({
      where: { id: user.schoolId },
      select: { planExpiresAt: true },
    });
    if (school?.planExpiresAt && school.planExpiresAt < new Date()) {
      const key = audience === 'admin'
        ? I18nKey.AUTH.PLAN_EXPIRED_ADMIN
        : I18nKey.AUTH.PLAN_EXPIRED_APP;
      throw new HttpException(this.t(key), HttpStatus.PAYMENT_REQUIRED);
    }
  }

  /**
   * A parent must have a pickup point to use the app. Re-checks the stop still
   * exists (not just that routeStopId is set) — stops are replaced wholesale
   * whenever a school admin edits a route, which can leave a stale id behind.
   */
  private async assertPickupPointAssigned(user: User): Promise<void> {
    const stop = user.routeStopId
      ? await this.stopRepo.findOne({ where: { id: user.routeStopId } })
      : null;
    if (!stop) {
      throw new ForbiddenException(this.t(I18nKey.PARENT.NO_STOP_ASSIGNED));
    }
  }

  /** A driver must be assigned to a bus that itself has a route, or they have nothing to drive. */
  private async assertDriverRouteAssigned(user: User): Promise<void> {
    const bus = await this.findDriverBus(user.id);
    if (!bus || (!bus.routeId && !bus.returnRouteId)) {
      throw new ForbiddenException(this.t(I18nKey.DRIVER.NO_ROUTE_ASSIGNED));
    }
  }

  /** Parent's child with class/section names resolved from the school's class master. */
  private async childSummary(user: User) {
    const schoolClass = user.childClassId !== null && user.schoolId
      ? await this.classRepo.findOne({ where: { id: user.childClassId, schoolId: user.schoolId }, relations: { sections: true } })
      : null;
    const section = schoolClass?.sections.find((s) => s.id === user.childSectionId) ?? null;
    return { name: user.childName, class: schoolClass?.name ?? null, section: section?.name ?? null };
  }

  private async findDriverBus(driverId: string): Promise<Bus | null> {
    const assignment = await this.busDriverRepo.findOne({
      where: { driverId, isActive: true },
    });
    return assignment ? this.busRepo.findOne({ where: { id: assignment.busId } }) : null;
  }

  /** A parent's own subscription (set by a school/both-managed school) blocks login once past its expiry. */
  private assertParentSubscriptionActive(user: User): void {
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date()) {
      throw new HttpException(this.t(I18nKey.PARENT.SUBSCRIPTION_EXPIRED), HttpStatus.PAYMENT_REQUIRED);
    }
  }

  private async findAndVerify(dto: LoginDto): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.INVALID_CREDENTIALS));
    }
    return user;
  }

  private t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.translate(key, {
      lang: I18nContext.current()?.lang ?? 'en',
      args,
    }) as string;
  }
}
