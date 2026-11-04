import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Bus } from '../buses/bus.entity';
import { BusDriver } from '../bus-drivers/bus-driver.entity';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Bus, BusDriver])],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
