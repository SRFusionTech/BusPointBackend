import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
} from 'class-validator';

export class UpdateBusDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  plateNumber?: string;

  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  capacity?: number;

  @IsUUID()
  @IsOptional()
  routeId?: string | null;

  @IsUUID()
  @IsOptional()
  returnRouteId?: string | null;
}
