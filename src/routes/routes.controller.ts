import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Put,
} from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { BulkStopsDto } from './dto/bulk-stops.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';

@Controller('routes')
@Roles(Role.SCHOOL_ADMIN)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@SchoolId() schoolId: string, @Body() dto: CreateRouteDto) {
    return this.routes.create(schoolId, dto);
  }

  @Get()
  findAll(@SchoolId() schoolId: string) {
    return this.routes.findAll(schoolId);
  }

  @Get(':id')
  findOne(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findOne(schoolId, id);
  }

  @Patch(':id')
  update(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routes.update(schoolId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@SchoolId() schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.routes.remove(schoolId, id);
  }

  @Put(':id/stops')
  bulkReplaceStops(
    @SchoolId() schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkStopsDto,
  ) {
    return this.routes.bulkReplaceStops(schoolId, id, dto);
  }
}
