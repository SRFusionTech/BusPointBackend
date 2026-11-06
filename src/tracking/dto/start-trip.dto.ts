import { IsLatitude, IsLongitude, IsNumber, IsOptional, Min } from 'class-validator';

/** Driver taps Start: only their current position. Direction is worked out by the server. */
export class StartTripDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}
