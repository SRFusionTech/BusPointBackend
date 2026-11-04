import { IsIn, IsOptional } from 'class-validator';
import { SUBSCRIPTION_MANAGERS, type SubscriptionManager } from '../school-settings';

/** Partial update — only the keys sent are changed. */
export class UpdateSchoolSettingsDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_MANAGERS)
  subscriptionManagedBy?: SubscriptionManager;
}
