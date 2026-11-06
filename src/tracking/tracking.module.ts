import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './trip.entity';
import { TripStop } from './trip-stop.entity';
import { TripLocation } from './trip-location.entity';
import { TripEvent } from './trip-event.entity';
import { Bus } from '../buses/bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { Route } from '../routes/route.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { School } from '../schools/school.entity';
import { User } from '../users/user.entity';
import { SchoolClass } from '../classes/school-class.entity';
import { ClassSection } from '../classes/class-section.entity';
import { TripsService } from './trips.service';
import { TripMonitorService } from './trip-monitor.service';
import { TripsController } from './trips.controller';
import { TripChanges } from './trip-changes';
import { ParentTripsService } from './parent-trips.service';
import { TrackingGateway } from './tracking.gateway';
import { AuthModule } from '../auth/auth.module';

/** Live tracking + trip history. The backend is the only place that decides stop progress. */
@Module({
  imports: [
    AuthModule, // JwtService for socket auth
    TypeOrmModule.forFeature([
      Trip, TripStop, TripLocation, TripEvent,
      Bus, BusDriver, Route, RouteStop, School, User, SchoolClass, ClassSection,
    ]),
  ],
  controllers: [TripsController],
  providers: [TripChanges, TripsService, ParentTripsService, TripMonitorService, TrackingGateway],
  exports: [TripsService],
})
export class TrackingModule {}
