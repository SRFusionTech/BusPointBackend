import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { SchoolsService } from '../schools/schools.service';
import { CreateClassDto, ReorderClassesDto, UpdateClassDto } from './dto/class.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * Lets a super admin manage the class + section master of any school, picked by id
 * in the path — same operations as the school admin's /classes. SchoolsService.findOne
 * throws 404 for an unknown school, and every service call is scoped by that school id.
 */
@Controller('schools/:schoolId/classes')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly schools: SchoolsService,
  ) {}

  @Get()
  async findAll(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    await this.schools.findOne(schoolId);
    return this.classes.findAll(schoolId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: CreateClassDto) {
    await this.schools.findOne(schoolId);
    return this.classes.create(schoolId, dto);
  }

  // Declared before ':id' so "reorder" is never parsed as an id
  @Patch('reorder')
  async reorder(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ReorderClassesDto) {
    await this.schools.findOne(schoolId);
    return this.classes.reorder(schoolId, dto.ids);
  }

  @Patch(':id')
  async update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassDto,
  ) {
    await this.schools.findOne(schoolId);
    return this.classes.update(schoolId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.schools.findOne(schoolId);
    return this.classes.remove(schoolId, id);
  }
}
