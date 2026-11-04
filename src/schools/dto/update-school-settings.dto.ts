import { IsDateString, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { SUBSCRIPTION_MANAGERS, type SubscriptionManager } from '../school-settings';

/** Partial update — only the keys sent are changed. */
export class UpdateSchoolSettingsDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_MANAGERS)
  subscriptionManagedBy?: SubscriptionManager;

  /**
   * Plan UUID or null to unassign.
   * No restrictions are enforced yet — the association is recorded for future billing logic.
   */
  @IsOptional()
  @ValidateIf((o) => o.planId !== null)
  @IsUUID()
  planId?: string | null;

  /**
   * Platform-level expiry date (ISO 8601 string) or null to clear.
   * When set and in the past, all logins for this school are blocked (HTTP 402).
   */
  @IsOptional()
  @ValidateIf((o) => o.planExpiresAt !== null)
  @IsDateString()
  planExpiresAt?: string | null;
}
