import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { BusesService } from './buses.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';
import { BusDriversService } from '../bus-drivers/bus-drivers.service';
import { AssignDriverDto } from '../bus-drivers/dto/assign-driver.dto';

@Controller('buses')
@Roles(Role.SCHOOL_ADMIN)
export class BusesController {
  constructor(
    private readonly buses: BusesService,
    private readonly busDrivers: BusDriversService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@SchoolId() schoolId: string, @Body() dto: CreateBusDto) {
    return this.buses.create(schoolId, dto);
  }

  @Get()
  findAll(@SchoolId() schoolId: string) {
    return this.buses.findAll(schoolId);
  }

  @Get(':id')
  findOne(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.buses.findOne(schoolId, id);
  }

  @Patch(':id')
  update(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
  ) {
    return this.buses.update(schoolId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.buses.remove(schoolId, id);
  }

  @Post(':id/driver')
  @HttpCode(HttpStatus.OK)
  assignDriver(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.busDrivers.assign(schoolId, id, dto);
  }

  @Delete(':id/driver')
  @HttpCode(HttpStatus.OK)
  unassignDriver(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.busDrivers.unassign(schoolId, id);
  }

  @Get(':id/driver')
  getCurrentDriver(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.busDrivers.getCurrentDriver(schoolId, id);
  }
}
