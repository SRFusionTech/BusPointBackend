import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bus } from './entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { BusesService } from './buses.service';
import { BusesController } from './buses.controller';
import { BusIconsModule } from '../bus-icons/bus-icons.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bus, BusDriver]), BusIconsModule, TrackingModule],
  controllers: [BusesController],
  providers: [BusesService],
  exports: [BusesService],
})
export class BusesModule {}
