import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusDriver } from './bus-driver.entity';
import { Bus } from '../buses/bus.entity';
import { User } from '../users/user.entity';
import { BusDriversService } from './bus-drivers.service';

@Module({
  imports: [TypeOrmModule.forFeature([BusDriver, Bus, User])],
  providers: [BusDriversService],
  exports: [BusDriversService],
})
export class BusDriversModule {}
