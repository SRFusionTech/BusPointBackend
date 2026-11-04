import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  IsPhoneNumber,
} from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(5)
  address!: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  // Admin account
  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsString()
  adminPhone!: string;
}
