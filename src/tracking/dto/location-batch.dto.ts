import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsLatitude, IsLongitude, IsNumber, IsOptional, ValidateNested } from 'class-validator';

export class LocationPointDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number | null;

  /** m/s (phones report -1 when unknown). */
  @IsOptional()
  @IsNumber()
  speed?: number | null;

  @IsOptional()
  @IsNumber()
  heading?: number | null;

  @IsISO8601()
  recordedAt!: string;
}

/** A batch of queued GPS points from the driver phone (sent every ~5–10 s, or later when back online). */
export class LocationBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points!: LocationPointDto[];
}
