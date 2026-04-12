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
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';

// ─── Payload shapes ───────────────────────────────────────────────────────────

interface LocationPayload {
  busId: string;
  driverId?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  timestamp?: string;
}

interface StatusPayload {
  busId: string;
  status: BusStatus;
}

// ─── GPS heartbeat constants ──────────────────────────────────────────────────

/** If no location update arrives within this window, mark bus as GPS_LOST. */
const GPS_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  /**
   * socketId → busId  — tracks which bus a driver socket is broadcasting for.
   * Used in handleDisconnect to emit GPS_LOST when driver drops.
   */
  private readonly driverBusMap = new Map<string, string>();

  /**
   * busId → timer  — heartbeat per active bus.
   * Reset on every location_update; fires GPS_LOST if driver goes silent.
   */
  private readonly gpsHeartbeat = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepository: Repository<BusDriver>,
  ) {}

  // ─── Heartbeat helpers ────────────────────────────────────────────────────

  private clearHeartbeat(busId: string): void {
    const timer = this.gpsHeartbeat.get(busId);
    if (timer) {
      clearTimeout(timer);
      this.gpsHeartbeat.delete(busId);
    }
  }

  private resetHeartbeat(busId: string): void {
    this.clearHeartbeat(busId);
    const timer = setTimeout(async () => {
      this.gpsHeartbeat.delete(busId);
      try {
        await this.busRepository.update(busId, { status: BusStatus.GPS_LOST });
        this.server.to(`bus:${busId}`).emit('bus_status', {
          busId,
          status: BusStatus.GPS_LOST,
          timestamp: new Date().toISOString(),
        });
        this.logger.warn(`Bus ${busId}: heartbeat timeout → GPS_LOST`);
      } catch (err) {
        this.logger.error(`Heartbeat GPS_LOST update failed for bus ${busId}`, err);
      }
    }, GPS_TIMEOUT_MS);
    this.gpsHeartbeat.set(busId, timer);
  }

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) throw new Error('No token');

      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOneBy({ id: payload.sub });
      if (!user) throw new Error('User not found');

      client.data.user = user;
      this.logger.log(`Connected: ${user.role} ${user.id} (socket ${client.id})`);
    } catch {
      this.logger.warn(`Rejected unauthenticated connection: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = client.data.user as User | undefined;
    this.logger.log(
      `Disconnected: ${user ? `${user.role} ${user.id}` : 'unknown'} (socket ${client.id})`,
    );

    // If this was a driver socket, immediately signal GPS lost to parents
    if (user?.role === UserRole.DRIVER) {
      const busId = this.driverBusMap.get(client.id);
      if (busId) {
        this.driverBusMap.delete(client.id);
        this.clearHeartbeat(busId);
        try {
          await this.busRepository.update(busId, { status: BusStatus.GPS_LOST });
          this.server.to(`bus:${busId}`).emit('bus_status', {
            busId,
            status: BusStatus.GPS_LOST,
            timestamp: new Date().toISOString(),
          });
          this.logger.warn(`Driver ${user.id} disconnected → Bus ${busId} marked GPS_LOST`);
        } catch (err) {
          this.logger.error(`Failed to mark GPS_LOST on disconnect for bus ${busId}`, err);
        }
      }
    }
  }

  // ─── Shared: subscribe to a bus room ──────────────────────────────────────

  @SubscribeMessage('join_bus')
  async handleJoinBus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { busId: string },
  ): Promise<{ event: string; data: object }> {
    const user = client.data.user as User;
    const bus = await this.busRepository.findOneBy({ id: payload.busId });
    if (!bus) throw new WsException('Bus not found');

    if (user.role === UserRole.PARENT) {
      if (!user.busId || user.busId !== payload.busId) {
        throw new WsException('Parents can only track their assigned bus');
      }
    } else if (user.role === UserRole.DRIVER) {
      const assignment = await this.busDriverRepository.findOne({
        where: { driverId: user.id, busId: payload.busId, isActive: true },
      });
      if (!assignment) {
        throw new WsException('Driver is not assigned to this bus');
      }
    }

    const room = `bus:${payload.busId}`;
    await client.join(room);
    this.logger.log(`Socket ${client.id} joined ${room}`);

    // Send the latest known snapshot immediately so parent gets position on join
    return {
      event: 'bus_snapshot',
      data: {
        busId:       bus.id,
        latitude:    bus.lastLat,
        longitude:   bus.lastLng,
        lat:         bus.lastLat,
        lng:         bus.lastLng,
        status:      bus.status,
        lastUpdated: bus.lastUpdated?.toISOString() ?? null,
        iconUrl:     bus.iconUrl,
      },
    };
  }

  @SubscribeMessage('leave_bus')
  async handleLeaveBus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { busId: string },
  ): Promise<{ event: string; data: object }> {
    const room = `bus:${payload.busId}`;
    await client.leave(room);
    this.logger.log(`Socket ${client.id} left ${room}`);
    return { event: 'left', data: { busId: payload.busId } };
  }

  // ─── Driver only: push location ───────────────────────────────────────────

  @SubscribeMessage('location_update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationPayload,
  ): Promise<{ event: string; data: object }> {
    const user = client.data.user as User;

    if (user.role !== UserRole.DRIVER) {
      throw new WsException('Only drivers can push location updates');
    }

    const { busId } = payload;
    const latitude = payload.latitude ?? payload.lat;
    const longitude = payload.longitude ?? payload.lng;

    if (latitude == null || longitude == null) {
      throw new WsException('Location coordinates are required');
    }

    // Validate driver→bus assignment once per connection (cache result on socket data)
    if (client.data.verifiedBusId !== busId) {
      const assignment = await this.busDriverRepository.findOne({
        where: { driverId: user.id, busId, isActive: true },
      });
      if (!assignment) {
        throw new WsException(`Driver ${user.id} is not assigned to bus ${busId}`);
      }
      client.data.verifiedBusId = busId;
    }

    // Track driver→bus for disconnect cleanup
    this.driverBusMap.set(client.id, busId);

    // Persist latest position
    const now = new Date();
    await this.busRepository.update(busId, {
      lastLat: latitude,
      lastLng: longitude,
      lastUpdated: now,
    });

    // Reset the GPS-lost watchdog
    this.resetHeartbeat(busId);

    const broadcastPayload = {
      busId,
      driverId: user.id,
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      timestamp: payload.timestamp ?? now.toISOString(),
    };

    // Broadcast to all subscribers of this bus (including the driver's own socket)
    this.server.to(`bus:${busId}`).emit('bus_location', broadcastPayload);

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Driver only: update bus status ───────────────────────────────────────

  @SubscribeMessage('status_update')
  async handleStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StatusPayload,
  ): Promise<{ event: string; data: object }> {
    const user = client.data.user as User;

    if (user.role !== UserRole.DRIVER) {
      throw new WsException('Only drivers can update bus status');
    }

    const { busId, status } = payload;

    await this.busRepository.update(busId, { status });

    // Clear the heartbeat when the trip is over
    if (status === BusStatus.ENDED || status === BusStatus.IDLE) {
      this.clearHeartbeat(busId);
      this.driverBusMap.delete(client.id);
    }

    const broadcastPayload = {
      busId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`bus:${busId}`).emit('bus_status', broadcastPayload);

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Server-initiated helpers ──────────────────────────────────────────────

  broadcastIconChange(busId: string, iconUrl: string): void {
    this.server.to(`bus:${busId}`).emit('bus_icon', { busId, iconUrl });
  }
}
