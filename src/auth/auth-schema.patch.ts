import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Same statements as sql/006_refresh_token_sessions.sql (kept inline: no dependency on the working dir). */
const STATEMENTS = [
  'ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id uuid NULL',
  'ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by uuid NULL',
  'ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_at timestamptz NULL',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id)',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by ON refresh_tokens (replaced_by)',
];

/**
 * Applies the refresh-token session columns at startup (Postgres only; idempotent). Production runs with
 * DB_SYNC=false and SQL patches are otherwise applied by hand — if this backend started before the columns
 * existed, every refresh would fail and log every user out. Running it here makes deploy order irrelevant.
 */
@Injectable()
export class AuthSchemaPatch implements OnModuleInit {
  private readonly logger = new Logger(AuthSchemaPatch.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return; // SQLite dev mode: synchronize creates them
    try {
      for (const sql of STATEMENTS) await this.dataSource.query(sql);
    } catch (err) {
      this.logger.error(`refresh_tokens session columns patch failed: ${(err as Error).message}`);
    }
  }
}
