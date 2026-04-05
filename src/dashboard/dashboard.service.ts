import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bus, BusStatus } from '../buses/entities/bus.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { Subscription, SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  private async countByRole(schoolId: string, roleName: RoleName): Promise<number> {
    return this.schoolUserRepository
      .createQueryBuilder('su')
      .innerJoin(Role, 'r', 'r.id = su.roleId AND r.name = :roleName', { roleName })
      .where('su.schoolId = :schoolId AND su.isActive = true', { schoolId })
      .getCount();
  }

  async getDashboard(schoolId: string) {
    const [buses, totalParents, totalDrivers, activeSubscriptions, recentNotifications] =
      await Promise.all([
        this.busRepository.findBy({ schoolId }),
        this.countByRole(schoolId, RoleName.PARENT),
        this.countByRole(schoolId, RoleName.DRIVER),
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrips = buses.filter(
      (b) =>
        b.lastUpdated &&
        b.lastUpdated >= today &&
        b.status !== BusStatus.IDLE &&
        b.status !== BusStatus.INACTIVE,
    ).length;

    return {
      buses,
      active_buses_count: activeBuses.length,
      idle_buses_count: idleBuses.length,
      total_buses: buses.length,
      today_trips: todayTrips,
      total_parents: totalParents,
      total_drivers: totalDrivers,
      active_subscriptions: activeSubscriptions,
      recent_notifications: recentNotifications,
    };
  }
}
