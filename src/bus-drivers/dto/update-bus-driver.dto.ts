import { IsString, IsOptional } from 'class-validator';

export class UpdateBusDriverDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
