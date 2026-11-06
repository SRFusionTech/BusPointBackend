import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Accept either a full URL or individual fields — both work
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_SSL: z.coerce.boolean().default(false),

  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().default(10000),
  DB_ACQUIRE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(600000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),

  DB_SYNC: z.coerce.boolean().default(false),
  DB_LOGGING: z.coerce.boolean().default(false),

  CORS_ORIGINS: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Access token TTL in minutes (short-lived)
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().default(15),
  // Refresh token TTL in days — separate for web and mobile
  JWT_REFRESH_TTL_DAYS_WEB: z.coerce.number().default(7),
  JWT_REFRESH_TTL_DAYS_MOBILE: z.coerce.number().default(30),

  // Road-following trip paths: OSRM (free) is used; override the server with OSRM_URL (e.g. self-hosted).
  OSRM_URL: z.string().optional(),
  // Optional paid fallback when OSRM fails (Google Routes API). Leave unset to never call Google.
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

  // Super admin seed — read once on startup
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
}).refine(
  (data) =>
    !!data.DATABASE_URL ||
    (!!data.DB_HOST && !!data.DB_USERNAME && !!data.DB_PASSWORD && !!data.DB_NAME),
  {
    message:
      'Provide either DATABASE_URL or all of DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME',
  },
);

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return result.data;
}
