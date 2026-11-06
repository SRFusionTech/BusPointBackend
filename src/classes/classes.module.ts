import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolClass } from './school-class.entity';
import { ClassSection } from './class-section.entity';
import { User } from '../users/user.entity';
import { SchoolsModule } from '../schools/schools.module';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { SuperAdminClassesController } from './super-admin-classes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SchoolClass, ClassSection, User]), SchoolsModule],
  controllers: [ClassesController, SuperAdminClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
