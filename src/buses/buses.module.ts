import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bus } from './bus.entity';
import { User } from '../users/user.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { Route } from '../routes/route.entity';
import { BusesService } from './buses.service';
import { BusDriversService } from '../bus-drivers/bus-drivers.service';
import { BusesController } from './buses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Bus, User, BusDriver, Route])],
  controllers: [BusesController],
  providers: [BusesService, BusDriversService],
  exports: [BusesService],
})
export class BusesModule {}
