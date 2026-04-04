import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateBusDriverDto {
  @IsUUID()
  busId: string;

  @IsUUID()
  driverId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
