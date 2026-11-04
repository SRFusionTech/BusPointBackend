import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { SeedSuperAdminService } from './seed-super-admin.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        const sslEnabled = config.get<string>('DB_SSL') === 'true';
        const ssl = sslEnabled ? { rejectUnauthorized: false } : false;

        const extra = {
          min: config.get<number>('DB_POOL_MIN') ?? 2,
          max: config.get<number>('DB_POOL_MAX') ?? 20,
          connectionTimeoutMillis: config.get<number>('DB_CONNECT_TIMEOUT_MS') ?? 10000,
          idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS') ?? 600000,
          statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS') ?? 30000,
        };

        const base = {
          type: 'postgres' as const,
          synchronize: config.get<boolean>('DB_SYNC') ?? false,
          logging: config.get<boolean>('DB_LOGGING') ?? false,
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsRun: false,
          autoLoadEntities: true,
          extra,
          ssl,
          // All timestamps stored and read as UTC
          timezone: 'Z',
        };

        if (databaseUrl) {
          return { ...base, url: databaseUrl };
        }

        return {
          ...base,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT') ?? 5432,
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
        };
      },
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [SeedSuperAdminService],
})
export class DatabaseModule {}
