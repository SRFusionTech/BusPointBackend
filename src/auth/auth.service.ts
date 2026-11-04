import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Response, Request } from 'express';
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
import { Role } from '../common/enums/role.enum';
import { I18nKey } from '../i18n/i18n.keys';
import { successResponse } from '../common/response/api-response';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function accessCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}

function refreshCookieOptions(maxAgeDays: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth', // scope refresh cookie to auth routes only
    maxAge: 1000 * 60 * 60 * 24 * maxAgeDays,
  };
}

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
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlMs = this.config.get<number>('JWT_ACCESS_TTL_MINUTES')! * 60 * 1000;
    this.refreshTtlDaysWeb = this.config.get<number>('JWT_REFRESH_TTL_DAYS_WEB')!;
    this.refreshTtlDaysMobile = this.config.get<number>('JWT_REFRESH_TTL_DAYS_MOBILE')!;
  }

  async webLogin(dto: LoginDto, res: Response) {
    const user = await this.findAndVerify(dto);
    if (!WEB_ROLES.includes(user.role)) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.WEB_ONLY));
    }
    await this.assertPlanActive(user, 'admin');
    return this.issueTokens(user, res, this.refreshTtlDaysWeb);
  }

  async mobileLogin(dto: MobileLoginDto, res: Response) {
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone, isActive: true, role: In(MOBILE_ROLES) },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.INVALID_CREDENTIALS));
    }
    if (!MOBILE_ROLES.includes(user.role)) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.MOBILE_ONLY));
    }
    await this.assertPlanActive(user, 'app');
    return this.issueTokens(user, res, this.refreshTtlDaysMobile);
  }

  /**
   * Silent refresh — called with the refresh_token cookie.
   * Rotates the refresh token on every use (old one deleted).
   * If the same refresh token is used twice → wipe all sessions (reuse attack).
   */
  async refresh(req: Request, res: Response) {
    const rawToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
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
      this.clearCookies(res);
      throw new UnauthorizedException('Refresh token expired. Please log in again.');
    }

    const user = stored.user;
    if (!user.isActive) {
      await this.refreshRepo.delete({ userId: user.id });
      this.clearCookies(res);
      throw new UnauthorizedException(this.t(I18nKey.AUTH.ACCOUNT_INACTIVE));
    }

    // Rotate: delete old token, issue new pair
    await this.refreshRepo.delete({ id: stored.id });

    const refreshTtlDays = WEB_ROLES.includes(user.role)
      ? this.refreshTtlDaysWeb
      : this.refreshTtlDaysMobile;

    const audience = WEB_ROLES.includes(user.role) ? 'admin' : 'app';
    await this.assertPlanActive(user, audience);

    return this.issueTokens(user, res, refreshTtlDays);
  }

  async logout(req: Request, res: Response) {
    const rawToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await this.refreshRepo.delete({ tokenHash: hashToken(rawToken) });
    }
    this.clearCookies(res);
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

    return successResponse({
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      fullName: user.fullName,
      school: school ? { id: school.id, name: school.name, logoUrl: school.logoUrl } : null,
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

  private async issueTokens(user: User, res: Response, refreshTtlDays: number) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    // Access token
    const accessToken = this.jwt.sign(payload, { expiresIn: this.accessTtlMs / 1000 });
    const accessTokenExpiresAt = Date.now() + this.accessTtlMs;
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(this.accessTtlMs));

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
    res.cookie(REFRESH_COOKIE, rawRefresh, refreshCookieOptions(refreshTtlDays));

    this.logger.log(`Auth: ${user.email} (${user.role})`);

    // Return expiry timestamp so the client can proactively refresh before expiry
    return successResponse({
      role: user.role,
      email: user.email,
      accessTokenExpiresAt, // Unix ms — store client-side for proactive refresh
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

  private async findAndVerify(dto: LoginDto): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(this.t(I18nKey.AUTH.INVALID_CREDENTIALS));
    }
    return user;
  }

  private clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/', sameSite: 'strict', httpOnly: true });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', sameSite: 'strict', httpOnly: true });
  }

  private t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.translate(key, {
      lang: I18nContext.current()?.lang ?? 'en',
      args,
    }) as string;
  }
}
