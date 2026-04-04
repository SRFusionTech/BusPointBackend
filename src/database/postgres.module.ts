import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        const base = {
          type: 'postgres' as const,
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: config.get<string>('NODE_ENV') === 'development',
          ssl: databaseUrl ? { rejectUnauthorized: false } : false,
        };

        if (databaseUrl) {
          return { ...base, url: databaseUrl };
        }

        return {
          ...base,
          host: config.get<string>('postgres.host'),
          port: config.get<number>('postgres.port'),
          username: config.get<string>('postgres.username'),
          password: config.get<string>('postgres.password'),
          database: config.get<string>('postgres.database'),
        };
      },
    }),
  ],
})
export class PostgresModule {}
