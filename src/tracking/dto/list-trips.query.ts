import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListTripsQuery {
  /** Trips started on/after this time. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Trips started before this time. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** School admin only: one bus. */
  @IsOptional()
  @IsUUID()
  busId?: string;

  @IsOptional()
  @IsIn(['pickup', 'drop'])
  direction?: 'pickup' | 'drop';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
