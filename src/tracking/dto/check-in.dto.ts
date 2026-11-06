import { IsIn } from 'class-validator';
import { CHECK_IN_RESPONSES, type CheckInResponse } from '../trip.entity';

/** Driver's answer to "Bus stopped — everything OK?". */
export class CheckInDto {
  @IsIn(CHECK_IN_RESPONSES)
  response!: CheckInResponse;
}
