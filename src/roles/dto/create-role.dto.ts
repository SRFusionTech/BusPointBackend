import { IsEnum, IsString, IsOptional } from 'class-validator';
import { RoleName } from '../entities/role.entity';

export class CreateRoleDto {
  @IsEnum(RoleName)
  name: RoleName;

  @IsString()
  @IsOptional()
  description?: string;
}
