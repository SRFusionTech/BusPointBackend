import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { SchoolsService } from '../schools/schools.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * Read-only: lets a super admin browse a school's routes and stops
 * (e.g. to pick a pickup point when creating a parent for that school).
 */
@Controller('schools/:schoolId/routes')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminRoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly schools: SchoolsService,
  ) {}

  @Get()
  async findAll(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    await this.schools.findOne(schoolId);
    return this.routes.findAll(schoolId);
  }

  @Get(':id')
  async findOne(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schools.findOne(schoolId);
    return this.routes.findOne(schoolId, id);
  }
}
