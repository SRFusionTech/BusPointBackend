import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRouteStopDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  stopOrder: number;
}

export class CreateRouteDto {
  @IsUUID()
  schoolId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  startLat: number;

  @IsNumber()
  startLng: number;

  @IsString()
  @IsOptional()
  startAddress?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteStopDto)
  @IsOptional()
  stops?: CreateRouteStopDto[];
}
