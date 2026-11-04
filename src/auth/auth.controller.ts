import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';

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
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };
  }
}
