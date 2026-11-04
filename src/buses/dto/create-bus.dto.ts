import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateBusDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

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
  routeId?: string;

  @IsUUID()
  @IsOptional()
  returnRouteId?: string;
}
