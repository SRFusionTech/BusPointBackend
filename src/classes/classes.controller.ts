import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto, ReorderClassesDto, UpdateClassDto } from './dto/class.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';

/** School admin: the school's class + section master list. */
@Controller('classes')
@Roles(Role.SCHOOL_ADMIN)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  findAll(@SchoolId() schoolId: string) {
    return this.classes.findAll(schoolId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@SchoolId() schoolId: string, @Body() dto: CreateClassDto) {
    return this.classes.create(schoolId, dto);
  }

  // Declared before ':id' so "reorder" is never parsed as an id
  @Patch('reorder')
  reorder(@SchoolId() schoolId: string, @Body() dto: ReorderClassesDto) {
    return this.classes.reorder(schoolId, dto.ids);
  }

  @Patch(':id')
  update(
    @SchoolId() schoolId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classes.update(schoolId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@SchoolId() schoolId: string, @Param('id', ParseIntPipe) id: number) {
    return this.classes.remove(schoolId, id);
  }
}
