import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const COOKIE_NAME = 'access_token';
const COOKIE_OPTIONS = {
  httpOnly: true,                    // JS cannot read it
  sameSite: 'strict' as const,       // No cross-site requests
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  path: '/',
  maxAge: 60 * 60 * 24 * 7 * 1000,  // 7 days in ms
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, res: Response) {
    // TODO: query real user from DB and bcrypt.compare password
    // const user = await this.userRepo.findOne({ where: { email: dto.email } });
    // if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
    //   throw new UnauthorizedException('Invalid email or password');
    // }

    // Placeholder until User entity is added
    const mockUsers: Record<string, { id: string; role: string; schoolId: string | null }> = {
      'superadmin@srfusiontech.com': { id: 'sa-1', role: 'super_admin', schoolId: null },
      'admin@school.com':            { id: 'sc-1', role: 'school_admin', schoolId: 'school-1' },
    };

    const user = mockUsers[dto.email.toLowerCase()];
    if (!user || dto.password !== 'password123') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: dto.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    const token = this.jwt.sign(payload);

    // Set token in HttpOnly cookie — never sent in response body
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    this.logger.log(`Login: ${dto.email} (${user.role})`);

    // Return only what the frontend needs to redirect — NOT the token
    return {
      role: user.role,
      email: dto.email,
    };
  }

  logout(res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', httpOnly: true });
    return { message: 'Logged out' };
  }
}
