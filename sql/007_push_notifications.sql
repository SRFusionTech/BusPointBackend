-- Push notifications (FCM).
-- Also applied automatically at backend startup (PushSchemaPatch), so deploy order doesn't matter.

-- One row per device. A token belongs to exactly one user (re-registering moves it).
CREATE TABLE IF NOT EXISTS push_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        text        NOT NULL UNIQUE,
  provider     varchar(16) NOT NULL DEFAULT 'fcm',
  platform     varchar(16) NULL,
  app_version  varchar(32) NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);

-- Outbox: trip events not yet turned into pushes. Rows that exist when the column is added get now()
-- (old trips never notify); the default is then dropped so new events start unhandled.
ALTER TABLE trip_events ADD COLUMN IF NOT EXISTS notified_at timestamptz NULL DEFAULT now();
ALTER TABLE trip_events ALTER COLUMN notified_at DROP DEFAULT;
CREATE INDEX IF NOT EXISTS idx_trip_events_unnotified ON trip_events (id) WHERE notified_at IS NULL;

-- "Bus is 2 stops away" is sent once per trip stop.
ALTER TABLE trip_stops ADD COLUMN IF NOT EXISTS approach_notified_at timestamptz NULL;
