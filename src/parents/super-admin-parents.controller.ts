import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ParentsService } from './parents.service';
import { SchoolsService } from '../schools/schools.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * Lets a super admin manage parents for any school, picked by id in the path.
 * SchoolsService.findOne throws 404 if the school doesn't exist, which also
 * guards the parent operations below from touching an unknown school id.
 */
@Controller('schools/:schoolId/parents')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminParentsController {
  constructor(
    private readonly parents: ParentsService,
    private readonly schools: SchoolsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: CreateParentDto) {
    await this.schools.findOne(schoolId);
    return this.parents.create(schoolId, dto);
  }

  @Get()
  async findAll(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    await this.schools.findOne(schoolId);
    return this.parents.findAll(schoolId);
  }

  @Get(':id')
  async findOne(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schools.findOne(schoolId);
    return this.parents.findOne(schoolId, id);
  }

  @Patch(':id')
  async update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParentDto,
  ) {
    await this.schools.findOne(schoolId);
    return this.parents.update(schoolId, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schools.findOne(schoolId);
    return this.parents.resetPassword(schoolId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schools.findOne(schoolId);
    return this.parents.remove(schoolId, id);
  }
}
