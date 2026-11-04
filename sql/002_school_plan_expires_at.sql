-- Migration: plan support (run once on production after deploying this release)

-- 1. Plans lookup table
CREATE TABLE IF NOT EXISTS plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar NOT NULL UNIQUE,
  description varchar DEFAULT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed the default plan (idempotent)
INSERT INTO plans (name, description)
VALUES ('Standard', 'Default plan — no feature restrictions.')
ON CONFLICT (name) DO NOTHING;

-- 3. Add columns to schools
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS plan_id         uuid DEFAULT NULL REFERENCES plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz DEFAULT NULL;
