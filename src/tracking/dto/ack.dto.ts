import { IsIn } from 'class-validator';

/** School admin acknowledges an alert on a trip. */
export class AckDto {
  @IsIn(['sos', 'alerts'])
  type!: 'sos' | 'alerts';
}
