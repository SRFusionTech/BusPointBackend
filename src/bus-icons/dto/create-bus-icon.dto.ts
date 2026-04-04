import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { IconCategory } from '../entities/bus-icon.entity';

export class CreateBusIconDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsEnum(IconCategory)
  @IsOptional()
  category?: IconCategory;
}
