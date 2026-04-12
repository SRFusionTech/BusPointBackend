import { Controller, Post, Body, Request, Query, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingSchoolDto } from './dto/onboarding.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/firebase
  @Public()
  @Post('firebase')
  loginWithFirebase(@Body() dto: FirebaseAuthDto) {
    return this.authService.loginWithFirebase(dto);
  }

  // POST /api/auth/login
  @Public()
  @Post('login')
  loginWithPassword(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto);
  }

  // POST /api/auth/send-otp?phone=
  @Public()
  @Post('send-otp')
  sendOtp(@Query('phone') phone: string) {
    return this.authService.sendOtp(phone);
  }

  // POST /api/auth/verify-otp?phone=&otp=
  @Public()
  @Post('verify-otp')
  verifyOtp(@Query('phone') phone: string, @Query('otp') otp: string) {
    return this.authService.verifyOtp(phone, otp);
  }

  // POST /api/auth/onboarding/school  (requires valid JWT — admin only)
  @Post('onboarding/school')
  completeOnboarding(@Request() req: any, @Body() dto: OnboardingSchoolDto) {
    return this.authService.completeOnboarding(req.user.id, dto);
  }
}
