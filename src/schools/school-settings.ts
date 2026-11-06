/**
 * Per-school configuration, stored as one JSONB column on `schools.settings`.
 *
 * Adding a setting:
 *   1. add the field + its default here
 *   2. add a validated optional field to UpdateSchoolSettingsDto
 * No migration is needed — stored rows are merged over DEFAULT_SCHOOL_SETTINGS
 * on read, so older rows pick up the default automatically.
 */

/** Who manages parent subscriptions (plans, renewals, payment collection). */
export const SUBSCRIPTION_MANAGERS = ['platform', 'school', 'both'] as const;
export type SubscriptionManager = (typeof SUBSCRIPTION_MANAGERS)[number];

export interface SchoolSettings {
  subscriptionManagedBy: SubscriptionManager;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  subscriptionManagedBy: 'platform',
};

export function resolveSchoolSettings(
  stored: Partial<SchoolSettings> | null | undefined,
): SchoolSettings {
  return { ...DEFAULT_SCHOOL_SETTINGS, ...(stored ?? {}) };
}
