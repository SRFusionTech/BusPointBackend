import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateSubscriptionDto): Promise<Subscription> {
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    const subscription = this.subscriptionRepository.create({
      parentId: dto.parentId,
      schoolId: dto.schoolId,
      status: SubscriptionStatus.ACTIVE,
      startDate,
      expiryDate,
    });

    const saved = await this.subscriptionRepository.save(subscription);

    // Sync sub status on user record for fast reads
    await this.userRepository.update(dto.parentId, {
      subStatus: 'active',
      subExpiry: expiryDate,
    });

    return saved;
  }

  findAll(schoolId?: string, status?: SubscriptionStatus): Promise<Subscription[]> {
    const where: Partial<Subscription> = {};
    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;
    return this.subscriptionRepository.findBy(where);
  }

  async findByParent(parentId: string): Promise<{ subscriptions: Subscription[]; has_subscription: boolean }> {
    const subscriptions = await this.subscriptionRepository.findBy({ parentId });

    const now = new Date();
    for (const sub of subscriptions) {
      if (sub.status === SubscriptionStatus.ACTIVE && sub.expiryDate < now) {
        sub.status = SubscriptionStatus.EXPIRED;
        await this.subscriptionRepository.save(sub);
      }
    }

    const hasActive = subscriptions.some(
      (s) => s.status === SubscriptionStatus.ACTIVE,
    );

    return { subscriptions, has_subscription: hasActive };
  }

  async findOne(id: string): Promise<Subscription> {
    const sub = await this.subscriptionRepository.findOneBy({ id });
    if (!sub) {
      throw new NotFoundException(`Subscription with id ${id} not found`);
    }
    return sub;
  }

  // Admin: manually activate a subscription for a parent (renew for 30 days)
  async activateForParent(parentId: string, schoolId: string): Promise<Subscription> {
    return this.create({ parentId, schoolId });
  }

  // Admin: revoke all active subscriptions for a parent
  async revokeByParent(parentId: string): Promise<{ revoked: number }> {
    const active = await this.subscriptionRepository.findBy({
      parentId,
      status: SubscriptionStatus.ACTIVE,
    });

    for (const sub of active) {
      sub.status = SubscriptionStatus.EXPIRED;
      await this.subscriptionRepository.save(sub);
    }

    await this.userRepository.update(parentId, {
      subStatus: 'expired',
    });

    return { revoked: active.length };
  }
}
