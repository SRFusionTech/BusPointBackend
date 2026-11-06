import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Route } from './route.entity';
import { RouteStop } from './route-stop.entity';
import { Bus } from '../buses/bus.entity';
import { School } from '../schools/school.entity';
import { SchoolsModule } from '../schools/schools.module';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { SuperAdminRoutesController } from './super-admin-routes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Route, RouteStop, Bus, School]), SchoolsModule],
  controllers: [RoutesController, SuperAdminRoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
