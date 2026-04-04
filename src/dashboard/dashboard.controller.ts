import { Controller, Get, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /api/dashboard/:schoolId
  @Get(':schoolId')
  getDashboard(@Param('schoolId') schoolId: string) {
    return this.dashboardService.getDashboard(schoolId);
  }
}
