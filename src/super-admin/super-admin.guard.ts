import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface SuperAdminPayload {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN';
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Super admin token required');

    const token = authHeader.slice(7);
    try {
      const secret = this.configService.get<string>('SUPER_ADMIN_JWT_SECRET') ?? 'superadmin-secret-change-in-prod';
      const payload = this.jwtService.verify<SuperAdminPayload>(token, { secret });
      if (payload.role !== 'SUPER_ADMIN') throw new Error();
      (req as any).superAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired super admin token');
    }
  }
}
