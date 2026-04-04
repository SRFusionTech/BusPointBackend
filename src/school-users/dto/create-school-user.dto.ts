import { IsUUID, IsOptional } from 'class-validator';

export class CreateSchoolUserDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  schoolId: string;

  @IsUUID()
  @IsOptional()
  roleId?: string;
}
