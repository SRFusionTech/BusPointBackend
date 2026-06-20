/**
 * Apply idempotent Postgres schema patches (when DB_SYNC=false).
 * Usage: node scripts/patch-schema.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env' });

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set SUPABASE_DATABASE_URL or DATABASE_URL in .env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS route_stop_id character varying
`);

await client.query(`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'routeStopId'
    ) THEN
      UPDATE "users"
      SET route_stop_id = "routeStopId"
      WHERE route_stop_id IS NULL AND "routeStopId" IS NOT NULL;
    END IF;
  END $$
`);

await client.query(`
  UPDATE "users"
  SET "routeStopId" = route_stop_id
  WHERE "routeStopId" IS NULL AND route_stop_id IS NOT NULL
`);

await client.end();
console.log('Schema patch OK: users.route_stop_id (+ legacy routeStopId sync)');
