import { IsString, IsOptional, MinLength, Matches, IsBoolean } from 'class-validator';

export class UpdateDriverDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  fullName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
