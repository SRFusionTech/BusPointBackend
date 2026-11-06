import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SchoolId } from '../common/decorators/school-id.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TripsService } from './trips.service';
import { StartTripDto } from './dto/start-trip.dto';
import { LocationBatchDto } from './dto/location-batch.dto';
import { ListTripsQuery } from './dto/list-trips.query';
import { CheckInDto } from './dto/check-in.dto';
import { SosDto } from './dto/sos.dto';
import { AckDto } from './dto/ack.dto';
import { ParentTripsService } from './parent-trips.service';

@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly parentTrips: ParentTripsService,
  ) {}

  // ── Driver ──────────────────────────────────────────────────────────────────

  /** Driver home: bus + running trip, or where a trip can be started from. */
  @Get('active')
  @Roles(Role.DRIVER)
  active(@CurrentUser() user: JwtPayload) {
    return this.trips.active(user);
  }

  /** Start: body is only the driver's position; direction is detected. */
  @Post('start')
  @Roles(Role.DRIVER)
  @HttpCode(HttpStatus.CREATED)
  start(@CurrentUser() user: JwtPayload, @Body() dto: StartTripDto) {
    return this.trips.start(user, dto);
  }

  /** Batch of GPS points. Response = fresh trip snapshot. */
  @Post(':id/locations')
  @Roles(Role.DRIVER)
  @HttpCode(HttpStatus.OK)
  locations(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LocationBatchDto) {
    return this.trips.ingestLocations(user, id, dto);
  }

  /** Manual end (backup). Trips normally end by themselves at the last stop. */
  @Post(':id/end')
  @Roles(Role.DRIVER)
  @HttpCode(HttpStatus.OK)
  end(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.end(user, id);
  }

  /** Reply to "Bus stopped — everything OK?". */
  @Post(':id/check-in')
  @Roles(Role.DRIVER)
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckInDto) {
    return this.trips.checkIn(user, id, dto.response);
  }

  /** Emergency — alerts the school immediately. */
  @Post(':id/sos')
  @Roles(Role.DRIVER)
  @HttpCode(HttpStatus.OK)
  sos(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SosDto) {
    return this.trips.sos(user, id, dto);
  }

  // ── Parent (privacy-filtered: own stop + school + bus only) ─────────────────

  @Get('parent/home')
  @Roles(Role.PARENT)
  parentHome(@CurrentUser() user: JwtPayload) {
    return this.parentTrips.home(user);
  }

  @Get('parent/history')
  @Roles(Role.PARENT)
  parentHistory(@CurrentUser() user: JwtPayload, @Query() q: ListTripsQuery) {
    return this.parentTrips.history(user, q.page ?? 1, q.limit ?? 20);
  }

  @Get('parent/:id')
  @Roles(Role.PARENT)
  parentDetail(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.parentTrips.detail(user, id);
  }

  // ── School admin ────────────────────────────────────────────────────────────

  /** Acknowledge SOS or the current alerts of a trip. */
  @Post(':id/ack')
  @Roles(Role.SCHOOL_ADMIN)
  @HttpCode(HttpStatus.OK)
  ack(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AckDto) {
    return this.trips.acknowledge(user, id, dto.type);
  }

  /** Live fleet: every bus, presence, running trip with all stops + students. */
  @Get('fleet')
  @Roles(Role.SCHOOL_ADMIN)
  fleet(@SchoolId() schoolId: string) {
    return this.trips.fleet(schoolId);
  }

  // ── History (driver: own trips · school admin: whole school) ────────────────

  @Get()
  @Roles(Role.DRIVER, Role.SCHOOL_ADMIN)
  list(@CurrentUser() user: JwtPayload, @Query() q: ListTripsQuery) {
    return this.trips.list(user, q);
  }

  @Get(':id')
  @Roles(Role.DRIVER, Role.SCHOOL_ADMIN)
  detail(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.detail(user, id);
  }
}
