import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationStatus,
} from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  // Create and queue a notification
  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    const notification = new this.notificationModel(dto);
    return notification.save();
  }

  // Send a bulk notification to multiple recipients
  async createBulk(
    recipientIds: string[],
    dto: Omit<CreateNotificationDto, 'recipientId'>,
  ): Promise<NotificationDocument[]> {
    const docs = recipientIds.map((recipientId) => ({ ...dto, recipientId }));
    return this.notificationModel.insertMany(docs) as Promise<NotificationDocument[]>;
  }

  // Get notifications with optional bus/school filters
  findAll(busId?: string, schoolId?: string, limit = 50): Promise<NotificationDocument[]> {
    const filter: Record<string, any> = {};
    if (busId) filter['data.busId'] = busId;
    if (schoolId) filter['data.schoolId'] = schoolId;
    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Get all notifications for a recipient (newest first)
  findByRecipient(recipientId: string, limit = 50): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({ recipientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Get only unread notifications for a recipient
  findUnreadByRecipient(recipientId: string): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({ recipientId, isRead: false })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Count unread notifications for a recipient
  countUnread(recipientId: string): Promise<number> {
    return this.notificationModel.countDocuments({ recipientId, isRead: false });
  }

  async findOne(id: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel.findById(id).exec();
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
    const result = await this.notificationModel.updateMany(
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
    await this.notificationModel.findByIdAndDelete(id).exec();
  }

  // Delete all notifications for a recipient
  async removeAllForRecipient(recipientId: string): Promise<{ deleted: number }> {
    const result = await this.notificationModel.deleteMany({ recipientId });
    return { deleted: result.deletedCount };
  }
}
