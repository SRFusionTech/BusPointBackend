import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class UpdateSchoolUserDto {
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
