import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from './entities/user.entity';
import { QueryAlias } from '../common/decorators/query-alias.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /api/users
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // GET /api/users?school_id=xxx&role=driver&bus_id=yyy
  @Get()
  findAll(
    @Req() req: { user: { id: string; role: UserRole; schoolId?: string | null } },
    @QueryAlias('schoolId', 'school_id') schoolId?: string,
    @Query('role') role?: UserRole,
    @QueryAlias('busId', 'bus_id') busId?: string,
  ) {
    const requester = req.user;
    if (requester.role === UserRole.ADMIN) {
      if (!requester.schoolId) return [];
      if (schoolId && schoolId !== requester.schoolId) {
        throw new ForbiddenException('Cannot access another school');
      }
      return this.usersService.findAll(requester.schoolId, role, busId);
    }

    if (requester.role === UserRole.DRIVER) {
      const me = req.user as { id: string; role: UserRole; schoolId?: string | null; busId?: string | null };
      if (!me.busId) {
        throw new ForbiddenException('Driver is not assigned to a bus');
      }
      if (schoolId && me.schoolId && schoolId !== me.schoolId) {
        throw new ForbiddenException('Cannot access another school');
      }
      if (busId && busId !== me.busId) {
        throw new ForbiddenException('Cannot access another bus');
      }
      if (role && role !== UserRole.PARENT) {
        throw new ForbiddenException('Drivers can only list parents from their own bus');
      }
      return this.usersService.findAll(me.schoolId ?? undefined, UserRole.PARENT, me.busId);
    }

    throw new ForbiddenException('Only school admins can list users');
  }

  // GET /api/users/:id
  @Get(':id')
  async findOne(
    @Req() req: { user: { id: string; role: UserRole; schoolId?: string | null } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const requester = req.user;
    if (requester.role === UserRole.ADMIN) {
      const target = await this.usersService.findOne(id);
      if (target.schoolId !== requester.schoolId) {
        throw new ForbiddenException('Cannot access another school user');
      }
      return target;
    }
    if (requester.id !== id) {
      throw new ForbiddenException('Cannot access another user profile');
    }
    return this.usersService.findOne(id);
  }

  // PUT /api/users/:id
  @Put(':id')
  async update(
    @Req() req: { user: { id: string; role: UserRole; schoolId?: string | null } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const requester = req.user;
    if (requester.role === UserRole.ADMIN) {
      const target = await this.usersService.findOne(id);
      if (target.schoolId !== requester.schoolId) {
        throw new ForbiddenException('Cannot update another school user');
      }
      return this.usersService.update(id, updateUserDto);
    }

    if (requester.id !== id) {
      throw new ForbiddenException('Cannot update another user');
    }

    // Non-admin users cannot alter role/school linkage.
    const safeDto = { ...updateUserDto } as any;
    delete safeDto.role;
    delete safeDto.schoolId;
    delete safeDto.busId;

    return this.usersService.update(id, safeDto);
  }

  // DELETE /api/users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: { user: { id: string; role: UserRole; schoolId?: string | null } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const requester = req.user;
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can delete users');
    }
    const target = await this.usersService.findOne(id);
    if (target.schoolId !== requester.schoolId) {
      throw new ForbiddenException('Cannot delete another school user');
    }
    return this.usersService.remove(id);
  }
}
