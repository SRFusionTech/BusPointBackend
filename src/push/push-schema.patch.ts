import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Same statements as sql/007_push_notifications.sql (kept inline: no dependency on the working dir). */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS push_tokens (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token text NOT NULL UNIQUE,
     provider varchar(16) NOT NULL DEFAULT 'fcm',
     platform varchar(16) NULL,
     app_version varchar(32) NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_seen_at timestamptz NOT NULL DEFAULT now()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id)',
  'ALTER TABLE trip_events ADD COLUMN IF NOT EXISTS notified_at timestamptz NULL DEFAULT now()',
  'ALTER TABLE trip_events ALTER COLUMN notified_at DROP DEFAULT',
  'CREATE INDEX IF NOT EXISTS idx_trip_events_unnotified ON trip_events (id) WHERE notified_at IS NULL',
  'ALTER TABLE trip_stops ADD COLUMN IF NOT EXISTS approach_notified_at timestamptz NULL',
];

/** Applies the push tables/columns at startup (Postgres only; idempotent) so deploy order doesn't matter. */
@Injectable()
export class PushSchemaPatch implements OnModuleInit {
  private readonly logger = new Logger(PushSchemaPatch.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return;
    try {
      for (const sql of STATEMENTS) await this.dataSource.query(sql);
    } catch (err) {
      this.logger.error(`push schema patch failed: ${(err as Error).message}`);
    }
  }
}
