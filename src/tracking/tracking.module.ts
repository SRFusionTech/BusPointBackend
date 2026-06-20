import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { Route } from '../routes/entities/route.entity';
import { TrackingGateway } from './tracking.gateway';
import { TrackingController } from './tracking.controller';
import { TripProgressService } from './trip-progress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Bus, BusDriver, Route]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') as string,
      }),
    }),
  ],
  controllers: [TrackingController],
  providers: [TrackingGateway, TripProgressService],
  exports: [TrackingGateway, TripProgressService],
})
export class TrackingModule {}
