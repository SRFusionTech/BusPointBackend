import { registerAs } from '@nestjs/config';

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const postgresConfig = registerAs('postgres', () => ({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parsePort(process.env.POSTGRES_PORT, 5432),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'buspoint',
}));

export const mongoConfig = registerAs('mongo', () => ({
  // No localhost fallback — missing MONGO_URI means notifications are disabled.
  uri: process.env.MONGO_URI?.trim() || '',
  enabled: Boolean(process.env.MONGO_URI?.trim()),
}));
