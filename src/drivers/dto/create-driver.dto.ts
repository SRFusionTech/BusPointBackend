import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone!: string;
}
