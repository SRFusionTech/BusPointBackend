import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

export class SosDto {
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
