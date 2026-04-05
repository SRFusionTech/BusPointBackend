import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Bus, BusStatus } from '../buses/entities/bus.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { RoleName } from '../roles/entities/role.entity';
import { FirebaseService } from '../firebase/firebase.service';

interface LocationPayload {
  busId: string;
  lat: number;
  lng: number;
}

interface StatusPayload {
  busId: string;
  status: BusStatus;
}

// Haversine distance in meters between two GPS coordinates
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ~500 m ≈ 2 minutes at typical residential bus speed
const ARRIVAL_THRESHOLD_METERS = 500;
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  // Key: `${busId}:${parentId}`, Value: timestamp of last notification sent
  private readonly notificationSentAt = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
    private readonly firebaseService: FirebaseService,
  ) {}

  // ─── Connection lifecycle ───────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) throw new Error('No token');

      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOneBy({ id: payload.sub });
      if (!user) throw new Error('User not found');

      // Load this user's roles from school_users
      const memberships = await this.schoolUserRepository.find({
        where: { userId: user.id, isActive: true },
        relations: ['role'],
      });
      const roles = memberships
        .map((m) => m.role?.name)
        .filter((r): r is RoleName => r != null);

      client.data.user = user;
      client.data.roles = roles;

      this.logger.log(
        `Connected: [${roles.join(',')}] ${user.id} (socket ${client.id})`,
      );
    } catch {
      this.logger.warn(`Rejected unauthenticated connection: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as User | undefined;
    const roles = client.data.roles as RoleName[] | undefined;
    this.logger.log(
      `Disconnected: ${user ? `[${roles?.join(',')}] ${user.id}` : 'unknown'} (socket ${client.id})`,
    );
  }

  // ─── Shared: subscribe to a bus room ───────────────────────────────────────

  @SubscribeMessage('join_bus')
  async handleJoinBus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { busId: string },
  ) {
    const user = client.data.user as User;
    const roles = client.data.roles as RoleName[];

    const bus = await this.busRepository.findOneBy({ id: payload.busId });
    if (!bus) throw new WsException('Bus not found');

    // Parents can only subscribe to their own assigned bus
    if (roles.includes(RoleName.PARENT) && user.busId !== payload.busId) {
      throw new WsException('You are not assigned to this bus');
    }

    const room = `bus:${payload.busId}`;
    await client.join(room);
    this.logger.log(`Socket ${client.id} joined ${room}`);

    return {
      event: 'bus_snapshot',
      data: {
        busId: bus.id,
        lat: bus.lastLat,
        lng: bus.lastLng,
        status: bus.status,
        lastUpdated: bus.lastUpdated,
        iconUrl: bus.iconUrl,
      },
    };
  }

  @SubscribeMessage('leave_bus')
  async handleLeaveBus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { busId: string },
  ) {
    const room = `bus:${payload.busId}`;
    await client.leave(room);
    this.logger.log(`Socket ${client.id} left ${room}`);
    return { event: 'left', data: { busId: payload.busId } };
  }

  // ─── Driver only: push location ────────────────────────────────────────────

  @SubscribeMessage('location_update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationPayload,
  ) {
    const roles = client.data.roles as RoleName[];
    if (!roles.includes(RoleName.DRIVER)) {
      throw new WsException('Only drivers can push location updates');
    }

    const { busId, lat, lng } = payload;

    await this.busRepository.update(busId, {
      lastLat: lat,
      lastLng: lng,
      lastUpdated: new Date(),
    });

    const broadcastPayload = { busId, lat, lng, timestamp: new Date().toISOString() };
    this.server.to(`bus:${busId}`).emit('bus_location', broadcastPayload);

    this.checkAndNotifyParents(busId, lat, lng).catch((err) =>
      this.logger.error('Error during proximity check', err),
    );

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Driver only: update bus status ────────────────────────────────────────

  @SubscribeMessage('status_update')
  async handleStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StatusPayload,
  ) {
    const roles = client.data.roles as RoleName[];
    if (!roles.includes(RoleName.DRIVER)) {
      throw new WsException('Only drivers can update bus status');
    }

    const { busId, status } = payload;
    await this.busRepository.update(busId, { status });

    const broadcastPayload = { busId, status, timestamp: new Date().toISOString() };
    this.server.to(`bus:${busId}`).emit('bus_status', broadcastPayload);

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Server-initiated: broadcast icon change ───────────────────────────────

  broadcastIconChange(busId: string, iconUrl: string) {
    this.server.to(`bus:${busId}`).emit('bus_icon', { busId, iconUrl });
  }

  // ─── Proximity detection: notify parents when bus is ~2 min away ────────────

  private async checkAndNotifyParents(busId: string, busLat: number, busLng: number) {
    // Find all active parents on this bus who have home coords + FCM token
    // Join through school_users to filter by PARENT role
    const parents = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin(
        'school_users',
        'su',
        'su."userId" = u.id AND su."isActive" = true',
      )
      .innerJoin(
        'roles',
        'r',
        'r.id = su."roleId" AND r.name = :roleName',
        { roleName: RoleName.PARENT },
      )
      .where('u."busId" = :busId', { busId })
      .andWhere('u."isActive" = true')
      .andWhere('u."homeLat" IS NOT NULL')
      .andWhere('u."homeLng" IS NOT NULL')
      .andWhere('u."fcmToken" IS NOT NULL')
      .getMany();

    const now = Date.now();

    for (const parent of parents) {
      const distance = haversineMeters(busLat, busLng, parent.homeLat!, parent.homeLng!);
      if (distance > ARRIVAL_THRESHOLD_METERS) continue;

      const cooldownKey = `${busId}:${parent.id}`;
      const lastSent = this.notificationSentAt.get(cooldownKey) ?? 0;
      if (now - lastSent < NOTIFICATION_COOLDOWN_MS) continue;

      this.notificationSentAt.set(cooldownKey, now);

      await this.firebaseService.sendPushNotification(
        parent.fcmToken!,
        'Bus arriving soon!',
        `Your child's bus is about 2 minutes away. Please be ready.`,
        { busId, distance: String(Math.round(distance)) },
      );

      this.logger.log(
        `Arrival notification sent to parent ${parent.id} (bus ${busId}, distance ${Math.round(distance)}m)`,
      );
    }
  }
}
