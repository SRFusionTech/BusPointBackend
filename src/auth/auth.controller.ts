import {
  Body, Controller, ForbiddenException, Get, HttpCode,
  HttpStatus, Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from './strategies/jwt.strategy';
import { Role } from '../common/enums/role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Web login — SUPER_ADMIN and SCHOOL_ADMIN only */
  @Public()
  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  webLogin(@Body() dto: LoginDto) {
    return this.auth.webLogin(dto);
  }

  /** Mobile login — DRIVER and PARENT only, uses phone + password */
  @Public()
  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  mobileLogin(@Body() dto: MobileLoginDto) {
    return this.auth.mobileLogin(dto);
  }

  /**
   * Silent refresh — takes the stored refresh token in the body, issues a new token pair.
   * @Public because the access token is already expired at this point.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }

  /** Change password — not available to SUPER_ADMIN */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SCHOOL_ADMIN, Role.DRIVER, Role.PARENT)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtPayload) {
    return this.auth.changePassword(user.sub, dto);
  }
}
