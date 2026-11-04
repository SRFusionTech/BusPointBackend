import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name!: string;
}
