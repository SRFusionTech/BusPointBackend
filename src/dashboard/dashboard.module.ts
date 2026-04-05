import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { Bus } from '../buses/entities/bus.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { Role } from '../roles/entities/role.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bus, SchoolUser, Role, Subscription]),
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
