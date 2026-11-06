import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SchoolsModule } from './schools/schools.module';
import { PlansModule } from './plans/plans.module';
import { BusesModule } from './buses/buses.module';
import { RoutesModule } from './routes/routes.module';
import { DriversModule } from './drivers/drivers.module';
import { ParentsModule } from './parents/parents.module';
import { ClassesModule } from './classes/classes.module';
import { TrackingModule } from './tracking/tracking.module';
import { RolesGuard } from './common/guards/roles.guard';
import { I18nModule, AcceptLanguageResolver, QueryResolver, HeaderResolver } from 'nestjs-i18n';
import * as path from 'path';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { I18nBridge } from './i18n/translate';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        // In dev, read from source so watch mode doesn't break when dist is wiped.
        // In prod, read from compiled dist (copied via nest-cli.json assets).
        path: process.env.NODE_ENV === 'production'
          ? path.join(__dirname, '/i18n/')
          : path.join(__dirname, '../src/i18n/'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    SchoolsModule,
    PlansModule,
    BusesModule,
    RoutesModule,
    DriversModule,
    ParentsModule,
    ClassesModule,
    TrackingModule,
  ],
  providers: [
    I18nBridge,
    // JWT guard applied globally — use @Public() to bypass
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Roles guard applied globally — use @Roles(...) on controllers/handlers
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
