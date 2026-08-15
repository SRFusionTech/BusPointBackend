import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import {
  Notification,
  NotificationDocument,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument> | null,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private requireMongo(): Model<NotificationDocument> {
    if (!this.notificationModel) {
      throw new ServiceUnavailableException(
        'Notifications require MONGO_URI. Core app data uses Supabase/Postgres; set MONGO_URI to enable notification storage.',
      );
    }
    return this.notificationModel;
  }

  private async createAndMarkSent(dto: CreateNotificationDto): Promise<NotificationDocument> {
    const model = this.requireMongo();
    const notification = new model({
      ...dto,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });
    return notification.save();
  }

  private buildDataPayload(data: Record<string, any> = {}): Record<string, string> {
    const payload: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value == null) continue;
      payload[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return payload;
  }

  private async sendPushToUsers(
    users: User[],
    title: string,
    message: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    const tokens = users
      .map((user) => user.fcmToken)
      .filter((token): token is string => typeof token === 'string' && token.trim().length > 0);

    if (tokens.length === 0) {
      this.logger.debug(`No FCM tokens found for ${users.length} user(s); skipped push send`);
      return;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: this.buildDataPayload(data),
    });

    this.logger.log(
      `Push notification sent: ${response.successCount}/${tokens.length} successful`,
    );
  }

  // Create and queue a notification
  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    return this.createAndMarkSent(dto);
  }

  // Send a bulk notification to multiple recipients
  async createBulk(
    recipientIds: string[],
    dto: Omit<CreateNotificationDto, 'recipientId'>,
  ): Promise<NotificationDocument[]> {
    const docs = recipientIds.map((recipientId) => ({
      ...dto,
      recipientId,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    }));
    return this.requireMongo().insertMany(docs) as Promise<NotificationDocument[]>;
  }

  // Get notifications with optional bus/school filters
  findAll(busId?: string, schoolId?: string, limit = 50): Promise<NotificationDocument[]> {
    const filter: Record<string, any> = {};
    if (busId) filter['data.busId'] = busId;
    if (schoolId) filter['data.schoolId'] = schoolId;
    return this.requireMongo()
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Get all notifications for a recipient (newest first)
  findByRecipient(recipientId: string, limit = 50): Promise<NotificationDocument[]> {
    return this.requireMongo()
      .find({ recipientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Get only unread notifications for a recipient
  findUnreadByRecipient(recipientId: string): Promise<NotificationDocument[]> {
    return this.requireMongo()
      .find({ recipientId, isRead: false })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Count unread notifications for a recipient
  countUnread(recipientId: string): Promise<number> {
    return this.requireMongo().countDocuments({ recipientId, isRead: false });
  }

  async findOne(id: string): Promise<NotificationDocument> {
    const notification = await this.requireMongo().findById(id).exec();
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  // Mark a single notification as read
  async markAsRead(id: string): Promise<NotificationDocument> {
    const notification = await this.findOne(id);
    notification.isRead = true;
    notification.readAt = new Date();
    notification.status = NotificationStatus.READ;
    return notification.save();
  }

  // Mark all notifications as read for a recipient
  async markAllAsRead(recipientId: string): Promise<{ updated: number }> {
    const result = await this.requireMongo().updateMany(
      { recipientId, isRead: false },
      { $set: { isRead: true, readAt: new Date(), status: NotificationStatus.READ } },
    );
    return { updated: result.modifiedCount };
  }

  // Update notification status (e.g., SENT, FAILED)
  async updateStatus(
    id: string,
    status: NotificationStatus,
    failureReason?: string,
  ): Promise<NotificationDocument> {
    const notification = await this.findOne(id);
    notification.status = status;
    if (status === NotificationStatus.SENT) {
      notification.sentAt = new Date();
    }
    if (status === NotificationStatus.FAILED && failureReason) {
      notification.failureReason = failureReason;
    }
    return notification.save();
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.requireMongo().findByIdAndDelete(id).exec();
  }

  // Delete all notifications for a recipient
  async removeAllForRecipient(recipientId: string): Promise<{ deleted: number }> {
    const result = await this.requireMongo().deleteMany({ recipientId });
    return { deleted: result.deletedCount };
  }
}
