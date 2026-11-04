import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsLatitude, IsLongitude } from 'class-validator';
import { SchoolsService } from './schools.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolId } from '../common/decorators/school-id.decorator';

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
  get(@SchoolId() schoolId: string) {
    return this.schools.findMine(schoolId);
  }

  @Patch('location')
  setLocation(@SchoolId() schoolId: string, @Body() dto: SchoolLocationDto) {
    return this.schools.backfillLocation(schoolId, dto.lat, dto.lng);
  }
}
