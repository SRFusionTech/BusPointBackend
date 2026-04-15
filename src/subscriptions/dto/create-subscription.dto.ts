import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  @IsNotEmpty()
  parentId: string;

  @IsUUID()
  @IsNotEmpty()
  schoolId: string;
}
