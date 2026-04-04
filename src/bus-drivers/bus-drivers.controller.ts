import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BusDriversService } from './bus-drivers.service';
import { CreateBusDriverDto } from './dto/create-bus-driver.dto';
import { UpdateBusDriverDto } from './dto/update-bus-driver.dto';

@Controller('bus-drivers')
export class BusDriversController {
  constructor(private readonly busDriversService: BusDriversService) {}

  // POST /api/bus-drivers — assign a driver to a bus
  @Post()
  assign(@Body() createBusDriverDto: CreateBusDriverDto) {
    return this.busDriversService.assign(createBusDriverDto);
  }

  // GET /api/bus-drivers/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.busDriversService.findOne(id);
  }

  // GET /api/bus-drivers/bus/:busId/active — current active driver
  @Get('bus/:busId/active')
  getActiveDriver(@Param('busId', ParseUUIDPipe) busId: string) {
    return this.busDriversService.getActiveDriver(busId);
  }

  // GET /api/bus-drivers/bus/:busId/history — full assignment history for a bus
  @Get('bus/:busId/history')
  getHistoryByBus(@Param('busId', ParseUUIDPipe) busId: string) {
    return this.busDriversService.getHistoryByBus(busId);
  }

  // GET /api/bus-drivers/driver/:driverId/history — all buses for a driver
  @Get('driver/:driverId/history')
  getHistoryByDriver(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.busDriversService.getHistoryByDriver(driverId);
  }

  // PATCH /api/bus-drivers/bus/:busId/unassign — remove current driver from bus
  @Patch('bus/:busId/unassign')
  unassign(@Param('busId', ParseUUIDPipe) busId: string) {
    return this.busDriversService.unassign(busId);
  }

  // PATCH /api/bus-drivers/:id — update notes on an assignment
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBusDriverDto: UpdateBusDriverDto,
  ) {
    return this.busDriversService.update(id, updateBusDriverDto);
  }

  // DELETE /api/bus-drivers/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.busDriversService.remove(id);
  }
}
