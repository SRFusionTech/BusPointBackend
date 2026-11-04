import {
  Body, Controller, ForbiddenException, Get, HttpCode,
  HttpStatus, Post, Req, Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from './strategies/jwt.strategy';
import { Role } from '../common/enums/role.enum';
import { successResponse } from '../common/response/api-response';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Web login — SUPER_ADMIN and SCHOOL_ADMIN only */
  @Public()
  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  webLogin(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.webLogin(dto, res);
  }

  /** Mobile login — DRIVER and PARENT only */
  @Public()
  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  mobileLogin(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.mobileLogin(dto, res);
  }

  /**
   * Silent refresh — uses the refresh_token cookie, issues a new access token.
   * @Public because the access token is already expired at this point.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
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

  /** Change password — not available to SUPER_ADMIN */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SCHOOL_ADMIN, Role.DRIVER, Role.PARENT)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtPayload) {
    return this.auth.changePassword(user.sub, dto);
  }
}
