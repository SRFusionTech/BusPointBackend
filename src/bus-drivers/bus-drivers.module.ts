import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusDriver } from './entities/bus-driver.entity';
import { Bus } from '../buses/entities/bus.entity';
import { User } from '../users/entities/user.entity';
import { BusDriversService } from './bus-drivers.service';
import { BusDriversController } from './bus-drivers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BusDriver, Bus, User])],
  controllers: [BusDriversController],
  providers: [BusDriversService],
  exports: [BusDriversService],
})
export class BusDriversModule {}
