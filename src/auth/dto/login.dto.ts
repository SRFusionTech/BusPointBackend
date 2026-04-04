import { IsString, IsNotEmpty, IsEmail, IsOptional, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf(o => !o.email)
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ValidateIf(o => !o.phone)
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
