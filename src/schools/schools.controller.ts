import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * All routes require SUPER_ADMIN role.
 * JwtAuthGuard (global) ensures the user is authenticated first;
 * RolesGuard (global) then checks the role claim from the JWT.
 */
@Controller('schools')
@Roles(Role.SUPER_ADMIN)
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSchoolDto) {
    return this.schools.create(dto);
  }

  @Get()
  findAll() {
    return this.schools.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.findOne(id);
  }

  @Get(':id/settings')
  getSettings(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.getSettings(id);
  }

  @Patch(':id/settings')
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSchoolSettingsDto,
  ) {
    return this.schools.updateSettings(id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSchoolDto,
  ) {
    return this.schools.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.remove(id);
  }

  @Post(':id/reset-admin-password')
  @HttpCode(HttpStatus.OK)
  resetAdminPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.resetAdminPassword(id);
  }
}
