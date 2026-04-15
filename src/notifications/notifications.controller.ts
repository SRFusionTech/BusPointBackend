import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationStatus } from './schemas/notification.schema';
import { QueryAlias } from '../common/decorators/query-alias.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // POST /api/notifications
  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  // POST /api/notifications/bulk
  @Post('bulk')
  createBulk(
    @Body()
    body: {
      recipientIds: string[];
      notification: Omit<CreateNotificationDto, 'recipientId'>;
    },
  ) {
    return this.notificationsService.createBulk(
      body.recipientIds,
      body.notification,
    );
  }

  // GET /api/notifications?bus_id=xxx&school_id=xxx&limit=50
  @Get()
  findAll(
    @QueryAlias('busId', 'bus_id') busId?: string,
    @QueryAlias('schoolId', 'school_id') schoolId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.findAll(busId, schoolId, limit);
  }

  // GET /api/notifications/parent/:parentId?limit=50
  @Get('parent/:parentId')
  findByParent(
    @Param('parentId') parentId: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.findByRecipient(parentId, limit);
  }

  // GET /api/notifications/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationsService.findOne(id);
  }

  // GET /api/notifications/recipient/:recipientId
  @Get('recipient/:recipientId')
  findByRecipient(@Param('recipientId') recipientId: string) {
    return this.notificationsService.findByRecipient(recipientId);
  }

  // GET /api/notifications/recipient/:recipientId/unread
  @Get('recipient/:recipientId/unread')
  findUnread(@Param('recipientId') recipientId: string) {
    return this.notificationsService.findUnreadByRecipient(recipientId);
  }

  // GET /api/notifications/recipient/:recipientId/unread-count
  @Get('recipient/:recipientId/unread-count')
  countUnread(@Param('recipientId') recipientId: string) {
    return this.notificationsService.countUnread(recipientId);
  }

  // PATCH /api/notifications/:id/read
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  // PATCH /api/notifications/recipient/:recipientId/read-all
  @Patch('recipient/:recipientId/read-all')
  markAllAsRead(@Param('recipientId') recipientId: string) {
    return this.notificationsService.markAllAsRead(recipientId);
  }

  // PATCH /api/notifications/:id/status
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: NotificationStatus; failureReason?: string },
  ) {
    return this.notificationsService.updateStatus(
      id,
      body.status,
      body.failureReason,
    );
  }

  // DELETE /api/notifications/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }

  // DELETE /api/notifications/recipient/:recipientId
  @Delete('recipient/:recipientId')
  removeAllForRecipient(@Param('recipientId') recipientId: string) {
    return this.notificationsService.removeAllForRecipient(recipientId);
  }
}
