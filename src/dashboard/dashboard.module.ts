import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Bus } from '../buses/entities/bus.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { isMongoEnabled } from '../database/mongo-enabled';

@Module({})
export class DashboardModule {
  static forRoot(): DynamicModule {
    const mongoEnabled = isMongoEnabled();
    return {
      module: DashboardModule,
      imports: [
        TypeOrmModule.forFeature([Bus, User, Subscription]),
        ...(mongoEnabled
          ? [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])]
          : []),
      ],
      controllers: [DashboardController],
      providers: [
        DashboardService,
        ...(mongoEnabled
          ? []
          : [{ provide: getModelToken(Notification.name), useValue: null }]),
      ],
    };
  }
}
