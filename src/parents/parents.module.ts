import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { SchoolsModule } from '../schools/schools.module';
import { ClassesModule } from '../classes/classes.module';
import { ParentsService } from './parents.service';
import { ParentsController } from './parents.controller';
import { SuperAdminParentsController } from './super-admin-parents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, RouteStop]), SchoolsModule, ClassesModule],
  controllers: [ParentsController, SuperAdminParentsController],
  providers: [ParentsService],
  exports: [ParentsService],
})
export class ParentsModule {}
