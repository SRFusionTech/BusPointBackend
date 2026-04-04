import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

export enum NotificationType {
  BUS_UPDATE = 'BUS_UPDATE',
  ALERT = 'ALERT',
  INFO = 'INFO',
  SUBSCRIPTION = 'SUBSCRIPTION',
  SYSTEM = 'SYSTEM',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

@Schema({ timestamps: true })
export class Notification {
  // Who receives the notification (references users.id in Postgres)
  @Prop({ required: true })
  recipientId: string;

  // Optional: who or what triggered it (userId, system, etc.)
  @Prop()
  senderId: string;

  @Prop({ enum: NotificationType, default: NotificationType.INFO })
  type: NotificationType;

  @Prop({ required: true, enum: NotificationChannel })
  channel: NotificationChannel;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  // Flexible payload — any extra data (deep link, image URL, metadata, etc.)
  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  @Prop({ enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt: Date;

  @Prop({ default: Date.now })
  sentAt: Date;

  @Prop()
  failureReason: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Index for fast recipient lookups
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });
