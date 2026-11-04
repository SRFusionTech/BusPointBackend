import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { t } from '../../i18n/translate';
import { I18nKey } from '../../i18n/i18n.keys';

/**
 * The caller's school, taken only from the verified JWT — never from the request.
 * Every school-scoped query must filter by this. Rejects accounts without a school,
 * so a missing id can never turn into an unscoped query.
 */
export const SchoolId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest().user as JwtPayload | undefined;
  if (!user?.schoolId) throw new ForbiddenException(t(I18nKey.COMMON.NO_SCHOOL));
  return user.schoolId;
});
