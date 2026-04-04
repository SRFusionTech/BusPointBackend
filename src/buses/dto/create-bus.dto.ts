import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsInt,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { BusStatus } from '../entities/bus.entity';

export class CreateBusDto {
  @IsUUID()
  schoolId: string;

  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  routeName: string;

  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsEnum(BusStatus)
  @IsOptional()
  status?: BusStatus;

  @IsInt()
  @IsOptional()
  capacity?: number;

  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsInt()
  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
