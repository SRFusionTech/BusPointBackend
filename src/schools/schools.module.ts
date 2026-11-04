import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { School } from './school.entity';
import { User } from '../users/user.entity';
import { Plan } from '../plans/plan.entity';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { MySchoolController } from './my-school.controller';

@Module({
  imports: [TypeOrmModule.forFeature([School, User, Plan])],
  controllers: [SchoolsController, MySchoolController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
