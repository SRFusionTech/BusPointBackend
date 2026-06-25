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
          ADD COLUMN IF NOT EXISTS route_stop_id character varying,
          ADD COLUMN IF NOT EXISTS return_route_stop_id character varying
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

        await this.dataSource.query(`
          ALTER TABLE "buses"
          ADD COLUMN IF NOT EXISTS "returnRouteName" character varying,
          ADD COLUMN IF NOT EXISTS "returnRouteId" character varying,
          ADD COLUMN IF NOT EXISTS "activeRouteId" character varying,
          ADD COLUMN IF NOT EXISTS "activeDirection" character varying DEFAULT 'outbound'
        `);

        await this.dataSource.query(`
          ALTER TABLE "route_stops"
          ADD COLUMN IF NOT EXISTS "title" character varying
        `);

      } else {
        try {
          await this.dataSource.query(`
            ALTER TABLE "users" ADD COLUMN route_stop_id varchar
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "users" ADD COLUMN return_route_stop_id varchar
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "buses" ADD COLUMN "returnRouteName" varchar
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "buses" ADD COLUMN "returnRouteId" varchar
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "buses" ADD COLUMN "activeRouteId" varchar
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "buses" ADD COLUMN "activeDirection" varchar DEFAULT 'outbound'
          `);
        } catch {}
        try {
          await this.dataSource.query(`
            ALTER TABLE "route_stops" ADD COLUMN "title" varchar
          `);
        } catch {}
      }

      this.logger.log('Schema patches applied for users, buses, and route_stops');
    } catch (error) {
      this.logger.error(
        'Failed to apply schema patches',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}