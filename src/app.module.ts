import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PostgresModule } from './database/postgres.module';
import { MongoModule } from './database/mongo.module';
import { postgresConfig, mongoConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { SchoolsModule } from './schools/schools.module';
import { UsersModule } from './users/users.module';
import { SchoolUsersModule } from './school-users/school-users.module';
import { RolesModule } from './roles/roles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContentModule } from './content/content.module';
import { BusesModule } from './buses/buses.module';
import { BusDriversModule } from './bus-drivers/bus-drivers.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';
import { BusIconsModule } from './bus-icons/bus-icons.module';
import { TrackingModule } from './tracking/tracking.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [postgresConfig, mongoConfig, jwtConfig],
      envFilePath: '.env',
      expandVariables: false,
    }),
    PostgresModule,
    MongoModule,
    SchoolsModule,
    UsersModule,
    RolesModule,
    SchoolUsersModule,
    NotificationsModule,
    ContentModule,
    BusesModule,
    BusDriversModule,
    SubscriptionsModule,
    DashboardModule,
    AdminModule,
    FirebaseModule,
    AuthModule,
    SeedModule,
    BusIconsModule,
    TrackingModule,
    SuperAdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applies JwtAuthGuard to every route in the application.
    // Use @Public() on any route that should skip auth.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
