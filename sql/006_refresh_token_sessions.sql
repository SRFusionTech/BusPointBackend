-- Long-lived device sessions: refresh tokens rotate within a session ("family") and the previous token
-- stays usable for a safe retry (lost response / timeout) instead of logging the user out.
-- Also applied automatically at backend startup (AuthSchemaPatch), so deploy order doesn't matter.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id   uuid        NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by uuid        NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family      ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by ON refresh_tokens (replaced_by);
