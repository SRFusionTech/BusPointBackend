import { Type } from 'class-transformer';
import {
  IsArray, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

class LocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

class StopInputDto extends LocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

/**
 * The school (first stop) is never sent — the server always derives it from the
 * school's own location. `stops` are the pickups in order; `end` is the "Last Stop".
 */
export class BulkStopsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  stops!: StopInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  end?: LocationDto | null;
}
