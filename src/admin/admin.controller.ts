import { Controller, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // POST /api/admin/add-driver?phone=xxx&name=xxx&school_id=xxx&bus_id=xxx
  @Post('add-driver')
  addDriver(
    @Query('phone') phone: string,
    @Query('name') name: string,
    @Query('school_id') schoolId: string,
    @Query('bus_id') busId?: string,
  ) {
    return this.adminService.addDriver(phone, name, schoolId, busId);
  }

  // POST /api/admin/add-parent?phone=xxx&name=xxx&school_id=xxx&bus_id=xxx&child_name=xxx
  @Post('add-parent')
  addParent(
    @Query('phone') phone: string,
    @Query('name') name: string,
    @Query('school_id') schoolId: string,
    @Query('bus_id') busId: string,
    @Query('child_name') childName: string,
  ) {
    return this.adminService.addParent(phone, name, schoolId, busId, childName);
  }
}
