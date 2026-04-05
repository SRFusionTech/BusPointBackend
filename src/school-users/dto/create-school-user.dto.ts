import { IsUUID, IsOptional } from 'class-validator';

export class CreateSchoolUserDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  schoolId: string;

  @IsUUID()
  @IsOptional()
  roleId?: string;

  // Only relevant for PARENT role — the bus their child is assigned to
  @IsUUID()
  @IsOptional()
  busId?: string;
}
