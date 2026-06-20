import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Idempotent schema patches when DB_SYNC=false (external Postgres / Supabase).
 * TypeORM synchronize is off in production — new columns must be added explicitly.
 */
@Injectable()
export class DatabaseSchemaPatchService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSchemaPatchService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const type = this.dataSource.options.type;
    if (type !== 'postgres' && type !== 'sqlite') return;

    try {
      if (type === 'postgres') {
        await this.dataSource.query(`
          ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS route_stop_id character varying
        `);

        // Legacy column from an earlier patch (quoted camelCase).
        await this.dataSource.query(`
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

        // Unquoted postgres fold → routestopid
        await this.dataSource.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'users'
                AND column_name = 'routestopid'
            ) THEN
              UPDATE "users"
              SET route_stop_id = routestopid
              WHERE route_stop_id IS NULL AND routestopid IS NOT NULL;
            END IF;
          END $$
        `);
      } else {
        try {
          await this.dataSource.query(`
            ALTER TABLE "users" ADD COLUMN route_stop_id varchar
          `);
        } catch {
          // Column already exists on sqlite.
        }
      }

      this.logger.log('Schema patch applied: users.route_stop_id');
    } catch (error) {
      this.logger.error(
        'Failed to apply schema patch for users.route_stop_id',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
