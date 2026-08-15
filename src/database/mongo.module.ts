import { DynamicModule, Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getMongoUri, isMongoEnabled } from './mongo-enabled';

@Module({})
export class MongoModule {
  private static readonly logger = new Logger(MongoModule.name);

  /** Connect only when MONGO_URI is set. Core app runs on Postgres/Supabase without Mongo. */
  static forRoot(): DynamicModule {
    if (!isMongoEnabled()) {
      this.logger.warn(
        'MONGO_URI not set — skipping MongoDB. Notifications APIs will be unavailable; core data uses Supabase/Postgres.',
      );
      return { module: MongoModule };
    }

    this.logger.log('Connecting to MongoDB for notifications');
    return {
      module: MongoModule,
      imports: [
        MongooseModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            uri: getMongoUri() || config.get<string>('mongo.uri'),
          }),
        }),
      ],
    };
  }
}
