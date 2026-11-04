import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { t } from '../../i18n/translate';
import { I18nKey } from '../../i18n/i18n.keys';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user;

    if (!required.includes(user.role)) {
      throw new ForbiddenException(t(I18nKey.COMMON.FORBIDDEN));
    }

    return true;
  }
}
