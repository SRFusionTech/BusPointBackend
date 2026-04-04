import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusIcon } from './entities/bus-icon.entity';
import { BusIconsService } from './bus-icons.service';
import { BusIconsController } from './bus-icons.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BusIcon])],
  controllers: [BusIconsController],
  providers: [BusIconsService],
  exports: [BusIconsService],
})
export class BusIconsModule {}
