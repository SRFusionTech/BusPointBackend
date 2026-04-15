import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { QueryAlias } from '../common/decorators/query-alias.decorator';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // GET /api/admin/school-routes?school_id=...
  @Get('school-routes')
  getSchoolRoutes(
    @Req() req: { user: User },
    @QueryAlias('schoolId', 'school_id') schoolId?: string,
  ) {
    return this.adminService.getSchoolRoutes(req.user, schoolId);
  }

  // POST /api/admin/add-driver?phone=xxx&name=xxx&school_id=xxx&bus_id=xxx
  @Post('add-driver')
  addDriver(
    @Req() req: { user: User },
    @Query('phone') phone: string,
    @Query('name') name: string,
    @QueryAlias('schoolId', 'school_id') schoolId: string,
    @QueryAlias('busId', 'bus_id') busId?: string,
  ) {
    const requester = req.user;
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only school admins can add drivers');
    }
    if (!requester.schoolId || requester.schoolId !== schoolId) {
      throw new ForbiddenException('Cannot manage another school');
    }
    return this.adminService.addDriver(phone, name, schoolId, busId);
  }

  // POST /api/admin/add-parent?phone=xxx&name=xxx&school_id=xxx&bus_id=xxx&child_name=xxx
  @Post('add-parent')
  addParent(
    @Req() req: { user: User },
    @Query('phone') phone: string,
    @Query('name') name: string,
    @QueryAlias('schoolId', 'school_id') schoolId: string,
    @QueryAlias('busId', 'bus_id') busId: string,
    @QueryAlias('childName', 'child_name') childName: string,
  ) {
    const requester = req.user;
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only school admins can add parents');
    }
    if (!requester.schoolId || requester.schoolId !== schoolId) {
      throw new ForbiddenException('Cannot manage another school');
    }
    return this.adminService.addParent(phone, name, schoolId, busId, childName);
  }
}
