import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { BusesService } from './buses.service';
import { BusIconsService } from '../bus-icons/bus-icons.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { BusStatus } from './entities/bus.entity';

@Controller('buses')
export class BusesController {
  constructor(
    private readonly busesService: BusesService,
    private readonly busIconsService: BusIconsService,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  // POST /api/buses
  @Post()
  create(@Body() createBusDto: CreateBusDto) {
    return this.busesService.create(createBusDto);
  }

  // GET /api/buses?school_id=xxx
  @Get()
  findAll(@Query('school_id') schoolId?: string) {
    return this.busesService.findAll(schoolId);
  }

  // GET /api/buses/school/:schoolId
  @Get('school/:schoolId')
  findBySchool(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.busesService.findBySchool(schoolId);
  }

  // GET /api/buses/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.busesService.findOne(id);
  }

  // PUT /api/buses/:id
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBusDto: UpdateBusDto,
  ) {
    return this.busesService.update(id, updateBusDto);
  }

  // PUT /api/buses/:id/location
  @Put(':id/location')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { lat: number; lng: number },
  ) {
    return this.busesService.updateLocation(id, body.lat, body.lng);
  }

  // PUT /api/buses/:id/status?status=started
  @Put(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: BusStatus,
  ) {
    return this.busesService.updateStatus(id, status);
  }

  // PATCH /api/buses/:id/icon  — assign a bus icon from the library
  @Patch(':id/icon')
  async assignIcon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('iconId', ParseUUIDPipe) iconId: string,
  ) {
    const icon = await this.busIconsService.findOne(iconId);
    const bus = await this.busesService.assignIcon(id, icon.id, icon.url);
    // Notify any connected clients watching this bus in real-time
    this.trackingGateway.broadcastIconChange(id, icon.url);
    return bus;
  }

  // DELETE /api/buses/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.busesService.remove(id);
  }
}
