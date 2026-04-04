import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionStatus } from './entities/subscription.entity';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // POST /api/subscriptions
  @Post()
  create(@Body() createSubscriptionDto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(createSubscriptionDto);
  }

  // GET /api/subscriptions?school_id=xxx&status=active
  @Get()
  findAll(
    @Query('school_id') schoolId?: string,
    @Query('status') status?: SubscriptionStatus,
  ) {
    return this.subscriptionsService.findAll(schoolId, status);
  }

  // GET /api/subscriptions/parent/:parentId
  @Get('parent/:parentId')
  findByParent(@Param('parentId') parentId: string) {
    return this.subscriptionsService.findByParent(parentId);
  }

  // GET /api/subscriptions/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  // POST /api/subscriptions/parent/:parentId/activate?school_id=
  @Post('parent/:parentId/activate')
  activateForParent(
    @Param('parentId') parentId: string,
    @Query('school_id') schoolId: string,
  ) {
    return this.subscriptionsService.activateForParent(parentId, schoolId);
  }

  // DELETE /api/subscriptions/parent/:parentId
  @Delete('parent/:parentId')
  revokeByParent(@Param('parentId') parentId: string) {
    return this.subscriptionsService.revokeByParent(parentId);
  }
}
