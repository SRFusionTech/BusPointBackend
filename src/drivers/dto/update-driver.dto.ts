import { IsString, IsOptional, MinLength, Matches, IsBoolean } from 'class-validator';

export class UpdateDriverDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  fullName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
