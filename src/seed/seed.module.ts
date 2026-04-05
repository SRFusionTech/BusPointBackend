import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { Bus } from '../buses/entities/bus.entity';
import { Role } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, School, Bus, Role, SchoolUser])],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
