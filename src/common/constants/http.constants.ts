export const HTTP_STATUS = {
  // 2xx
  OK:          200,
  CREATED:     201,
  NO_CONTENT:  204,

  // 4xx
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  CONFLICT:     409,
  UNPROCESSABLE: 422,
  TOO_MANY:     429,

  // 5xx
  INTERNAL:     500,
  BAD_GATEWAY:  502,
} as const;
