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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('routes')
@Roles(Role.SCHOOL_ADMIN)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRouteDto) {
    return this.routes.create(user.schoolId!, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.routes.findAll(user.schoolId!);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findOne(user.schoolId!, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routes.update(user.schoolId!, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.routes.remove(user.schoolId!, id);
  }

  @Put(':id/stops')
  bulkReplaceStops(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkStopsDto,
  ) {
    return this.routes.bulkReplaceStops(user.schoolId!, id, dto);
  }
}
