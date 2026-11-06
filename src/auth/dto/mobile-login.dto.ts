import { IsString, Matches, MinLength } from 'class-validator';

export class MobileLoginDto {
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
