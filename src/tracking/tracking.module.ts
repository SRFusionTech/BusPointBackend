import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { TrackingGateway } from './tracking.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Bus, SchoolUser]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') as string,
      }),
    }),
  ],
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class TrackingModule {}
