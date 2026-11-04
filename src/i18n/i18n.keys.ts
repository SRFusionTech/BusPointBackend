/** Type-safe i18n key constants. Use these instead of raw strings. */
export const I18nKey = {
  AUTH: {
    INVALID_CREDENTIALS: 'auth.invalid_credentials',
    UNAUTHORIZED: 'auth.unauthorized',
    WEB_ONLY: 'auth.web_only',
    MOBILE_ONLY: 'auth.mobile_only',
    LOGGED_OUT: 'auth.logged_out',
    ACCOUNT_INACTIVE: 'auth.account_inactive',
  },
  COMMON: {
    NOT_FOUND: 'common.not_found',
    ALREADY_EXISTS: 'common.already_exists',
    CREATED: 'common.created',
    UPDATED: 'common.updated',
    DELETED: 'common.deleted',
    INVALID_UUID: 'common.invalid_uuid',
    INVALID_PAYLOAD: 'common.invalid_payload',
    INTERNAL_ERROR: 'common.internal_error',
    SUCCESS: 'common.success',
  },
} as const;
