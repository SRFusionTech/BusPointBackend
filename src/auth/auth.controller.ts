import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';
import { Role } from '../common/enums/role.enum';
import { successResponse } from '../common/response/api-response';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Web login — super_admin and school_admin only
   * Used by: BusPoint web portal
   */
  @Public()
  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  webLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.webLogin(dto, res);
  }

  /**
   * Mobile login — driver and parent only
   * Used by: BusPoint mobile app
   */
  @Public()
  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  mobileLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.mobileLogin(dto, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    return this.auth.logout(res);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return successResponse({
      id: user.sub,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    });
  }

  /** Change password — not available to super_admin (they have no personal password policy) */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin accounts cannot change password via this endpoint.');
    }
    return this.auth.changePassword(user.sub, dto);
  }
}
