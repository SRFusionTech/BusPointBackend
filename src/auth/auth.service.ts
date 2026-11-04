import { Injectable, UnauthorizedException, Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { I18nKey } from '../i18n/i18n.keys';
import { successResponse } from '../common/response/api-response';

const COOKIE_NAME = 'access_token';

function cookieOptions(maxAgeDays: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * maxAgeDays * 1000,
  };
}

const WEB_ROLES = [Role.SUPER_ADMIN, Role.SCHOOL_ADMIN];
const MOBILE_ROLES = [Role.DRIVER, Role.PARENT];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly i18n: I18nService,
  ) {}

  async webLogin(dto: LoginDto, res: Response) {
    const user = await this.findAndVerify(dto);

    if (!WEB_ROLES.includes(user.role)) {
      throw new UnauthorizedException(
        this.t(I18nKey.AUTH.WEB_ONLY),
      );
    }

    return this.issueToken(user, res, 7);
  }

  async mobileLogin(dto: LoginDto, res: Response) {
    const user = await this.findAndVerify(dto);

    if (!MOBILE_ROLES.includes(user.role)) {
      throw new UnauthorizedException(
        this.t(I18nKey.AUTH.MOBILE_ONLY),
      );
    }

    return this.issueToken(user, res, 30);
  }

  logout(res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', httpOnly: true });
    return successResponse(null, this.t(I18nKey.AUTH.LOGGED_OUT));
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

  private issueToken(user: User, res: Response, maxAgeDays: number) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    const token = this.jwt.sign(payload);
    res.cookie(COOKIE_NAME, token, cookieOptions(maxAgeDays));

    this.logger.log(`Login: ${user.email} (${user.role})`);

    return successResponse(
      { role: user.role, email: user.email },
      this.t(I18nKey.COMMON.SUCCESS),
    );
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

    this.logger.log(`Password changed: ${user.email}`);
    return successResponse(null, this.t(I18nKey.COMMON.UPDATED));
  }

  /** Translate using the current request's language (falls back to 'en'). */
  private t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.translate(key, {
      lang: I18nContext.current()?.lang ?? 'en',
      args,
    }) as string;
  }
}
