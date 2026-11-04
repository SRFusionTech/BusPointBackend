export const MSG = {
  // Auth
  AUTH: {
    INVALID_CREDENTIALS:    'Invalid email or password',
    UNAUTHORIZED:           'Invalid or expired session',
    WEB_ONLY:               'Access denied — use the mobile app',
    MOBILE_ONLY:            'Access denied — use the web portal',
    LOGGED_OUT:             'Logged out successfully',
    ACCOUNT_INACTIVE:       'Account is inactive — contact your administrator',
  },

  // Generic CRUD
  CRUD: {
    NOT_FOUND:              (resource: string) => `${resource} not found`,
    ALREADY_EXISTS:         (resource: string) => `${resource} already exists`,
    CREATED:                (resource: string) => `${resource} created successfully`,
    UPDATED:                (resource: string) => `${resource} updated successfully`,
    DELETED:                (resource: string) => `${resource} deleted successfully`,
  },

  // Validation
  VALIDATION: {
    INVALID_UUID:           'Invalid ID format',
    INVALID_PAYLOAD:        'Request payload is invalid',
  },

  // Server
  SERVER: {
    INTERNAL:               'Something went wrong — please try again later',
  },
} as const;
