import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsLatitude, IsLongitude } from 'class-validator';
import { SchoolsService } from './schools.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

class SchoolLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

/** School-admin view of their own school. */
@Controller('my-school')
@Roles(Role.SCHOOL_ADMIN)
export class MySchoolController {
  constructor(private readonly schools: SchoolsService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.schools.findMine(user.schoolId!);
  }

  @Patch('location')
  setLocation(@CurrentUser() user: JwtPayload, @Body() dto: SchoolLocationDto) {
    return this.schools.backfillLocation(user.schoolId!, dto.lat, dto.lng);
  }
}
