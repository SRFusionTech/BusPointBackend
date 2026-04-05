import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { Role } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Bus, BusDriver, Role, SchoolUser])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
