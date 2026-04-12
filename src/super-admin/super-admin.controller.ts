import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdminGuard } from './super-admin.guard';
import { SuperAdminService } from './super-admin.service';
import { RequestStatus } from './access-request.entity';

@Public()
@Controller('superadmin')
export class SuperAdminController {
  constructor(private readonly svc: SuperAdminService) {}

  // ── Auth (public) ─────────────────────────────────────────────────────────
  @Public()
  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.svc.login(body.email, body.password);
  }

  // ── Platform stats ────────────────────────────────────────────────────────
  @UseGuards(SuperAdminGuard)
  @Get('stats')
  stats() { return this.svc.getPlatformStats(); }

  // ── Schools ───────────────────────────────────────────────────────────────
  @UseGuards(SuperAdminGuard)
  @Get('schools')
  listSchools() { return this.svc.listSchools(); }

  @UseGuards(SuperAdminGuard)
  @Post('schools')
  provisionSchool(@Body() body: { schoolName: string; location: string; adminEmail: string; adminName: string; adminPassword: string }) {
    return this.svc.provisionSchool(body);
  }

  @UseGuards(SuperAdminGuard)
  @Get('schools/:id')
  schoolDetail(@Param('id') id: string) { return this.svc.getSchoolDetail(id); }

  @UseGuards(SuperAdminGuard)
  @Patch('schools/:id/suspend')
  suspend(@Param('id') id: string) { return this.svc.suspendSchool(id); }

  @UseGuards(SuperAdminGuard)
  @Patch('schools/:id/reinstate')
  reinstate(@Param('id') id: string) { return this.svc.reinstateSchool(id); }

  @UseGuards(SuperAdminGuard)
  @Delete('schools/:id')
  deleteSchool(@Param('id') id: string) { return this.svc.deleteSchool(id); }

  // ── Access Requests ───────────────────────────────────────────────────────
  @Public()
  @Post('access-requests')
  createRequest(@Body() body: { name: string; schoolName: string; phone: string; plan?: string }) {
    return this.svc.createAccessRequest(body);
  }

  @UseGuards(SuperAdminGuard)
  @Get('access-requests')
  listRequests(@Query('status') status?: RequestStatus) {
    return this.svc.listAccessRequests(status);
  }

  @UseGuards(SuperAdminGuard)
  @Patch('access-requests/:id/approve')
  approveRequest(@Param('id') id: string, @Body() body: { adminEmail: string; adminPassword: string; location: string }) {
    return this.svc.approveRequest(id, body);
  }

  @UseGuards(SuperAdminGuard)
  @Patch('access-requests/:id/reject')
  rejectRequest(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.svc.rejectRequest(id, body.reason);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  @UseGuards(SuperAdminGuard)
  @Post('settings/change-password')
  changePassword(@Body() body: { currentPassword: string; newPassword: string }) {
    return this.svc.changePassword(body.currentPassword, body.newPassword);
  }
}
