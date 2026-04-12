import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { School } from '../schools/entities/school.entity';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { AccessRequest } from './access-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([School, User, Bus, AccessRequest]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('SUPER_ADMIN_JWT_SECRET') ?? 'superadmin-secret-change-in-prod',
        signOptions: { expiresIn: '12h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminGuard],
  exports: [SuperAdminGuard],
})
export class SuperAdminModule {}
