import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;
}
