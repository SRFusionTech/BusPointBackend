import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ParentsService } from './parents.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';

@Controller('parents')
@Roles(Role.SCHOOL_ADMIN)
export class ParentsController {
  constructor(private readonly parents: ParentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@SchoolId() schoolId: string, @Body() dto: CreateParentDto) {
    return this.parents.create(schoolId, dto);
  }

  @Get()
  findAll(@SchoolId() schoolId: string) {
    return this.parents.findAll(schoolId);
  }

  @Get(':id')
  findOne(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parents.findOne(schoolId, id);
  }

  @Patch(':id')
  update(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParentDto,
  ) {
    return this.parents.update(schoolId, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parents.resetPassword(schoolId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.parents.remove(schoolId, id);
  }
}
