import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class MobileLoginDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
