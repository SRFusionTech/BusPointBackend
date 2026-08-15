import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../users/entities/user.entity';
import { isMongoEnabled } from '../database/mongo-enabled';

@Module({})
export class NotificationsModule {
  static forRoot(): DynamicModule {
    const mongoEnabled = isMongoEnabled();
    return {
      module: NotificationsModule,
      imports: [
        TypeOrmModule.forFeature([User]),
        ...(mongoEnabled
          ? [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])]
          : []),
      ],
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        ...(mongoEnabled
          ? []
          : [{ provide: getModelToken(Notification.name), useValue: null }]),
      ],
      exports: [NotificationsService],
    };
  }
}
