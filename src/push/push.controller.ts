import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PushService } from './push.service';
import { RegisterPushTokenDto, RemovePushTokenDto } from './dto/push-token.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

/**
 * Devices that receive push notifications (mobile app).
 *   POST /api/push-tokens          driver / parent — register or refresh this device for the signed-in user
 *   POST /api/push-tokens/remove   public — sign-out or expired session on this device
 */
@Controller('push-tokens')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Roles(Role.DRIVER, Role.PARENT)
  @Post()
  @HttpCode(HttpStatus.OK)
  async register(@CurrentUser() user: JwtPayload, @Body() dto: RegisterPushTokenDto) {
    await this.push.register(user.sub, dto);
    return successResponse(null, t(I18nKey.PUSH.REGISTERED));
  }

  /** Public: also called after the session has expired. Knowing the device's FCM token is the proof. */
  @Public()
  @Post('remove')
  @HttpCode(HttpStatus.OK)
  async remove(@Body() dto: RemovePushTokenDto) {
    await this.push.remove(dto.token);
    return successResponse(null, t(I18nKey.PUSH.REMOVED));
  }
}
