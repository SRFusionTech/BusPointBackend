import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolUser } from './entities/school-user.entity';
import { SchoolUsersService } from './school-users.service';
import { SchoolUsersController } from './school-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SchoolUser])],
  controllers: [SchoolUsersController],
  providers: [SchoolUsersService],
  exports: [SchoolUsersService],
})
export class SchoolUsersModule {}
