import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';

@Controller('drivers')
@Roles(Role.SCHOOL_ADMIN)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@SchoolId() schoolId: string, @Body() dto: CreateDriverDto) {
    return this.drivers.create(schoolId, dto);
  }

  @Get()
  findAll(@SchoolId() schoolId: string) {
    return this.drivers.findAll(schoolId);
  }

  @Get(':id')
  findOne(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.findOne(schoolId, id);
  }

  @Patch(':id')
  update(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(schoolId, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.resetPassword(schoolId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.remove(schoolId, id);
  }
}
