import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';

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
  ) {}

  async webLogin(dto: LoginDto, res: Response) {
    const user = await this.findAndVerify(dto);

    if (!WEB_ROLES.includes(user.role)) {
      throw new UnauthorizedException('Access denied — use the mobile app');
    }

    return this.issueToken(user, res, 7);
  }

  async mobileLogin(dto: LoginDto, res: Response) {
    const user = await this.findAndVerify(dto);

    if (!MOBILE_ROLES.includes(user.role)) {
      throw new UnauthorizedException('Access denied — use the web portal');
    }

    return this.issueToken(user, res, 30); // longer session for mobile
  }

  logout(res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', httpOnly: true });
    return { message: 'Logged out' };
  }

  private async findAndVerify(dto: LoginDto): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
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

    return { role: user.role, email: user.email };
  }
}
