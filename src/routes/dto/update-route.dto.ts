import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateRouteDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;
}
