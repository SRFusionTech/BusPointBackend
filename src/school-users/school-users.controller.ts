import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SchoolUsersService } from './school-users.service';
import { CreateSchoolUserDto } from './dto/create-school-user.dto';
import { UpdateSchoolUserDto } from './dto/update-school-user.dto';

@Controller('school-users')
export class SchoolUsersController {
  constructor(private readonly schoolUsersService: SchoolUsersService) {}

  // POST /api/school-users
  @Post()
  create(@Body() createSchoolUserDto: CreateSchoolUserDto) {
    return this.schoolUsersService.create(createSchoolUserDto);
  }

  // GET /api/school-users
  @Get()
  findAll() {
    return this.schoolUsersService.findAll();
  }

  // GET /api/school-users/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schoolUsersService.findOne(id);
  }

  // GET /api/school-users/school/:schoolId — all users in a school
  @Get('school/:schoolId')
  findBySchool(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.schoolUsersService.findBySchool(schoolId);
  }

  // GET /api/school-users/user/:userId — all schools a user belongs to
  @Get('user/:userId')
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.schoolUsersService.findByUser(userId);
  }

  // PATCH /api/school-users/:id
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSchoolUserDto: UpdateSchoolUserDto,
  ) {
    return this.schoolUsersService.update(id, updateSchoolUserDto);
  }

  // DELETE /api/school-users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schoolUsersService.remove(id);
  }
}
