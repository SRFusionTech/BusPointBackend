import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto, CreateRouteStopDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ReorderStopsDto } from './dto/reorder-stops.dto';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // GET /api/routes?school_id=...
  @Get()
  findAll(@Query('school_id', ParseUUIDPipe) schoolId: string) {
    return this.routesService.findAllForSchool(schoolId);
  }

  // GET /api/routes/stops/:stopId — must be registered before GET :id
  @Get('stops/:stopId')
  findStop(@Param('stopId', ParseUUIDPipe) stopId: string) {
    return this.routesService.findStopById(stopId);
  }

  // GET /api/routes/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.routesService.findOne(id);
  }

  // POST /api/routes
  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routesService.create(dto);
  }

  // PATCH /api/routes/:id
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routesService.update(id, dto);
  }

  // DELETE /api/routes/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.routesService.remove(id);
  }

  // POST /api/routes/:id/stops
  @Post(':id/stops')
  addStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRouteStopDto,
  ) {
    return this.routesService.addStop(id, dto);
  }

  // PATCH /api/routes/stops/:stopId
  @Patch('stops/:stopId')
  updateStop(
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: Partial<CreateRouteStopDto>,
  ) {
    return this.routesService.updateStop(stopId, dto);
  }

  // DELETE /api/routes/stops/:stopId
  @Delete('stops/:stopId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeStop(@Param('stopId', ParseUUIDPipe) stopId: string) {
    return this.routesService.removeStop(stopId);
  }

  // PATCH /api/routes/:id/stops/reorder
  @Patch(':id/stops/reorder')
  reorderStops(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderStopsDto,
  ) {
    return this.routesService.reorderStops(id, dto);
  }
}
