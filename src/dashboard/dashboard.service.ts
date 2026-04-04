import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bus, BusStatus } from '../buses/entities/bus.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Subscription, SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async getDashboard(schoolId: string) {
    const [buses, totalParents, activeSubscriptions, recentNotifications] =
      await Promise.all([
        this.busRepository.findBy({ schoolId }),
        this.userRepository.count({ where: { schoolId, role: UserRole.PARENT } }),
        this.subscriptionRepository.count({
          where: { schoolId, status: SubscriptionStatus.ACTIVE },
        }),
        this.notificationModel
          .find({ 'data.schoolId': schoolId })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
          .exec(),
      ]);

    const activeBuses = buses.filter((b) =>
      [BusStatus.STARTED, BusStatus.AT_SCHOOL, BusStatus.RETURNING].includes(b.status),
    );

    const idleBuses = buses.filter((b) => b.status === BusStatus.IDLE);

    // Count today's trips (buses that started today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrips = buses.filter(
      (b) =>
        b.lastUpdated &&
        b.lastUpdated >= today &&
        b.status !== BusStatus.IDLE &&
        b.status !== BusStatus.INACTIVE,
    ).length;

    const totalDrivers = await this.userRepository.count({
      where: { schoolId, role: UserRole.DRIVER },
    });

    return {
      buses,
      active_buses_count: activeBuses.length,
      idle_buses_count: idleBuses.length,
      total_buses: buses.length,
      today_trips: todayTrips,
      total_parents: totalParents,
      active_subscriptions: activeSubscriptions,
      total_drivers: totalDrivers,
      recent_notifications: recentNotifications,
    };
  }
}
