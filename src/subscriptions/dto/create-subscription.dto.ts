import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  @IsNotEmpty()
  parent_id: string;

  @IsUUID()
  @IsNotEmpty()
  school_id: string;
}
