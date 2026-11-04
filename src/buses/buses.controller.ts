import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { BusesService } from './buses.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
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
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBusDto) {
    return this.buses.create(user.schoolId!, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.buses.findAll(user.schoolId!);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.buses.findOne(user.schoolId!, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
  ) {
    return this.buses.update(user.schoolId!, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.buses.remove(user.schoolId!, id);
  }

  @Post(':id/driver')
  @HttpCode(HttpStatus.OK)
  assignDriver(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.busDrivers.assign(user.schoolId!, id, dto);
  }

  @Delete(':id/driver')
  @HttpCode(HttpStatus.OK)
  unassignDriver(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.busDrivers.unassign(user.schoolId!, id);
  }

  @Get(':id/driver')
  getCurrentDriver(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.busDrivers.getCurrentDriver(user.schoolId!, id);
  }
}
