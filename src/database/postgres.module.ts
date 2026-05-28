import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const isFirestore = process.env.FIRESTORE === 'true';
const logger = new Logger('PostgresModule');

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveDatabaseUrl(config: ConfigService): string | undefined {
  return (
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    config.get<string>('SUPABASE_DATABASE_URL') ||
    config.get<string>('DATABASE_URL')
  )?.trim();
}

@Module({
  imports: [
    // When using Firestore for primary storage, avoid connecting to remote Postgres
    // but still register a TypeORM DataSource so repositories depending on it
    // can be resolved. Use an in-memory SQLite DB for that purpose.
    ...(isFirestore
      ? [
          ...(process.env.NODE_ENV === 'production'
            ? (() => {
                throw new Error(
                  'FIRESTORE=true uses in-memory SQLite and will lose data on restart. Disable FIRESTORE and configure SUPABASE_DATABASE_URL for persistent storage.',
                );
              })()
            : []),
          TypeOrmModule.forRoot({
            type: 'sqlite',
            database: ':memory:',
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: true,
            logging: false,
          }),
        ]
      : [
          TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
              const databaseUrl = resolveDatabaseUrl(config);
              const synchronize = parseBool(
                process.env.DB_SYNC ?? config.get<string>('DB_SYNC'),
                false,
              );
              const dropSchema = parseBool(
                process.env.DB_DROP_SCHEMA ?? config.get<string>('DB_DROP_SCHEMA'),
                false,
              );

              const base = {
                type: 'postgres' as const,
                entities: [__dirname + '/../**/*.entity{.ts,.js}'],
                synchronize,
                dropSchema,
                logging: config.get<string>('NODE_ENV') === 'development',
                ssl: databaseUrl ? { rejectUnauthorized: false } : false,
                // Cap auth-failure retries so a bad password fails fast instead
                // of hammering the Supabase pooler and tripping its circuit
                // breaker (which then blocks even correct credentials).
                retryAttempts: 3,
                retryDelay: 5000,
              };

              if (config.get<string>('NODE_ENV') === 'production' && !databaseUrl) {
                throw new Error(
                  'No Supabase/Postgres connection string configured. Set SUPABASE_DATABASE_URL or DATABASE_URL to a persistent Postgres instance.',
                );
              }

              if (databaseUrl) {
                logger.log('Using external Postgres connection string for persistence');
              } else {
                logger.warn('Using local Postgres fallback; data persists only while that database exists.');
              }

              if (databaseUrl) {
                return { ...base, url: databaseUrl };
              }

              return {
                ...base,
                host: process.env.POSTGRES_HOST || config.get<string>('postgres.host'),
                port: Number(process.env.POSTGRES_PORT ?? config.get<number>('postgres.port')),
                username: process.env.POSTGRES_USER || config.get<string>('postgres.username'),
                password: process.env.POSTGRES_PASSWORD || config.get<string>('postgres.password'),
                database: process.env.POSTGRES_DB || config.get<string>('postgres.database'),
              };
            },
          }),
        ]),
  ],
})
export class PostgresModule {}
