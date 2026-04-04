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
import { User, UserRole } from '../users/entities/user.entity';
import { Bus, BusStatus } from '../buses/entities/bus.entity';
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

// Cooldown: don't re-notify the same parent for the same bus within 15 minutes
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

      // Attach user to socket data so handlers can reference it
      client.data.user = user;
      this.logger.log(`Connected: ${user.role} ${user.id} (socket ${client.id})`);
    } catch {
      this.logger.warn(`Rejected unauthenticated connection: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as User | undefined;
    this.logger.log(
      `Disconnected: ${user ? `${user.role} ${user.id}` : 'unknown'} (socket ${client.id})`,
    );
  }

  // ─── Shared: subscribe to a bus room ───────────────────────────────────────

  @SubscribeMessage('join_bus')
  async handleJoinBus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { busId: string },
  ) {
    const user = client.data.user as User;
    const bus = await this.busRepository.findOneBy({ id: payload.busId });
    if (!bus) throw new WsException('Bus not found');

    // Parents can only subscribe to their own assigned bus
    if (user.role === UserRole.PARENT && user.busId !== payload.busId) {
      throw new WsException('You are not assigned to this bus');
    }

    const room = `bus:${payload.busId}`;
    await client.join(room);
    this.logger.log(`Socket ${client.id} joined ${room}`);

    // Send the latest known location immediately on join
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
    const user = client.data.user as User;
    if (user.role !== UserRole.DRIVER) {
      throw new WsException('Only drivers can push location updates');
    }

    const { busId, lat, lng } = payload;

    // Persist to DB
    await this.busRepository.update(busId, {
      lastLat: lat,
      lastLng: lng,
      lastUpdated: new Date(),
    });

    const broadcastPayload = {
      busId,
      lat,
      lng,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all subscribers of this bus
    this.server.to(`bus:${busId}`).emit('bus_location', broadcastPayload);

    // Check proximity for all parents assigned to this bus and notify if near
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
    const user = client.data.user as User;
    if (user.role !== UserRole.DRIVER) {
      throw new WsException('Only drivers can update bus status');
    }

    const { busId, status } = payload;

    await this.busRepository.update(busId, { status });

    const broadcastPayload = {
      busId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`bus:${busId}`).emit('bus_status', broadcastPayload);

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Server-initiated: broadcast icon change to all subscribers ─────────────

  broadcastIconChange(busId: string, iconUrl: string) {
    this.server.to(`bus:${busId}`).emit('bus_icon', { busId, iconUrl });
  }

  // ─── Proximity detection: notify parents when bus is ~2 min away ────────────

  private async checkAndNotifyParents(busId: string, busLat: number, busLng: number) {
    // Find all active parents assigned to this bus that have home coordinates and an FCM token
    const parents = await this.userRepository
      .createQueryBuilder('u')
      .where('u.busId = :busId', { busId })
      .andWhere('u.role = :role', { role: UserRole.PARENT })
      .andWhere('u.isActive = true')
      .andWhere('u.homeLat IS NOT NULL')
      .andWhere('u.homeLng IS NOT NULL')
      .andWhere('u.fcmToken IS NOT NULL')
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
