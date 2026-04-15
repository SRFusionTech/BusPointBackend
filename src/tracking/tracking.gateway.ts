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

interface ParentLocationPayload {
  busId: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  timestamp?: string;
}

interface ParentLocationSnapshot {
  parentId: string;
  parentName: string;
  childName: string | null;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
}

// ─── GPS heartbeat constants ──────────────────────────────────────────────────

/** If no location update arrives within this window, mark bus as GPS_LOST. */
const GPS_TIMEOUT_MS = 30_000;
const PARENT_LOCATION_CACHE_TTL_MS = 60_000;
const PARENT_LIVE_LOCATION_TTL_MS = 120_000;

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
  private readonly parentLocationCache = new Map<
    string,
    { parents: ParentLocationSnapshot[]; cachedAt: number }
  >();
  private readonly busDriverSockets = new Map<string, Set<string>>();
  private readonly parentLiveLocations = new Map<
    string,
    Map<
      string,
      ParentLocationSnapshot & {
        updatedAt: number;
      }
    >
  >();

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

  private distanceMeters(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number },
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private async getParentLocations(busId: string): Promise<ParentLocationSnapshot[]> {
    const cached = this.parentLocationCache.get(busId);
    if (cached && Date.now() - cached.cachedAt < PARENT_LOCATION_CACHE_TTL_MS) {
      return cached.parents;
    }

    const parents = await this.userRepository.findBy({
      role: UserRole.PARENT,
      busId,
    });

    const points = parents
      .filter((p) => p.homeLat != null && p.homeLng != null)
      .map((p) => ({
        parentId: p.id,
        parentName: p.name || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Parent',
        childName: p.childName ?? null,
        latitude: p.homeLat,
        longitude: p.homeLng,
      }));

    this.parentLocationCache.set(busId, { parents: points, cachedAt: Date.now() });
    return points;
  }

  private mergeLiveParentLocations(busId: string, base: ParentLocationSnapshot[]): ParentLocationSnapshot[] {
    const liveMap = this.parentLiveLocations.get(busId);
    if (!liveMap || liveMap.size === 0) return base;

    const now = Date.now();
    const mergedById = new Map(base.map((p) => [p.parentId, p]));

    for (const [parentId, live] of liveMap.entries()) {
      if (now - live.updatedAt > PARENT_LIVE_LOCATION_TTL_MS) {
        liveMap.delete(parentId);
        continue;
      }
      mergedById.set(parentId, {
        parentId: live.parentId,
        parentName: live.parentName,
        childName: live.childName,
        latitude: live.latitude,
        longitude: live.longitude,
      });
    }

    return Array.from(mergedById.values());
  }

  private addDriverSocket(busId: string, socketId: string): void {
    const set = this.busDriverSockets.get(busId) ?? new Set<string>();
    set.add(socketId);
    this.busDriverSockets.set(busId, set);
  }

  private removeDriverSocket(socketId: string): void {
    for (const [busId, set] of this.busDriverSockets.entries()) {
      if (!set.has(socketId)) continue;
      set.delete(socketId);
      if (set.size === 0) this.busDriverSockets.delete(busId);
      return;
    }
  }

  private async emitParentLocationsToDriver(
    client: Socket,
    busId: string,
    busCoord?: { latitude: number; longitude: number },
  ): Promise<void> {
    const points = this.mergeLiveParentLocations(busId, await this.getParentLocations(busId));
    const withDistance = busCoord
      ? points
          .map((p) => ({
            ...p,
            distanceMeters: this.distanceMeters(busCoord, p),
          }))
          .sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER))
      : points;

    client.emit('bus_parents_locations', {
      busId,
      updatedAt: new Date().toISOString(),
      parents: withDistance,
      recommendedParent: withDistance[0] ?? null,
    });
  }

  private async emitParentLocationsToDrivers(
    busId: string,
    busCoord?: { latitude: number; longitude: number },
  ): Promise<void> {
    const sockets = this.busDriverSockets.get(busId);
    if (!sockets || sockets.size === 0) return;

    for (const socketId of sockets) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) continue;
      await this.emitParentLocationsToDriver(socket, busId, busCoord);
    }
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
        this.removeDriverSocket(client.id);
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
      this.addDriverSocket(payload.busId, client.id);
    } else if (user.role === UserRole.ADMIN) {
      if (!user.schoolId || user.schoolId !== bus.schoolId) {
        throw new WsException('School admin can only track buses in their school');
      }
    } else {
      throw new WsException('Unsupported role for tracking');
    }

    const room = `bus:${payload.busId}`;
    await client.join(room);
    this.logger.log(`Socket ${client.id} joined ${room}`);

    // Driver app receives parent pickup points for route guidance.
    if (user.role === UserRole.DRIVER) {
      await this.emitParentLocationsToDriver(client, payload.busId, {
        latitude: bus.lastLat,
        longitude: bus.lastLng,
      });
    }

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
    const user = client.data.user as User;
    if (user?.role === UserRole.DRIVER) this.removeDriverSocket(client.id);

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

    const bus = await this.busRepository.findOneBy({ id: busId });
    if (!bus) {
      throw new WsException('Bus not found');
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

    const now = new Date();
    const payloadTime = payload.timestamp ? new Date(payload.timestamp) : now;
    const incomingTime = Number.isNaN(payloadTime.getTime()) ? now : payloadTime;

    // Ignore out-of-order updates to avoid jitter/race overwrites after reconnects.
    if (bus.lastUpdated && incomingTime.getTime() + 1500 < bus.lastUpdated.getTime()) {
      return {
        event: 'ack',
        data: {
          busId,
          dropped: true,
          reason: 'stale_update',
          latestTimestamp: bus.lastUpdated.toISOString(),
        },
      };
    }

    // Persist latest position
    await this.busRepository.update(busId, {
      lastLat: latitude,
      lastLng: longitude,
      lastUpdated: incomingTime,
      status: bus.status === BusStatus.GPS_LOST ? BusStatus.STARTED : bus.status,
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
      timestamp: incomingTime.toISOString(),
    };

    // Broadcast to all subscribers of this bus (including the driver's own socket)
    this.server.to(`bus:${busId}`).emit('bus_location', broadcastPayload);

    // Driver-only helper payload for pickup routing (kept off parent/admin channels).
    await this.emitParentLocationsToDrivers(busId, {
      latitude,
      longitude,
    });

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

    const validStatuses = new Set<BusStatus>([
      BusStatus.IDLE,
      BusStatus.STARTED,
      BusStatus.AT_SCHOOL,
      BusStatus.RETURNING,
      BusStatus.ENDED,
      BusStatus.GPS_LOST,
      BusStatus.INACTIVE,
      BusStatus.MAINTENANCE,
    ]);
    if (!validStatuses.has(status)) {
      throw new WsException('Invalid status value');
    }

    const assignment = await this.busDriverRepository.findOne({
      where: { driverId: user.id, busId, isActive: true },
    });
    if (!assignment) {
      throw new WsException(`Driver ${user.id} is not assigned to bus ${busId}`);
    }

    const bus = await this.busRepository.findOneBy({ id: busId });
    if (!bus) {
      throw new WsException('Bus not found');
    }

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

  // ─── Parent only: push live parent location for driver guidance ──────────

  @SubscribeMessage('parent_location_update')
  async handleParentLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ParentLocationPayload,
  ): Promise<{ event: string; data: object }> {
    const user = client.data.user as User;
    if (user.role !== UserRole.PARENT) {
      throw new WsException('Only parents can push parent location updates');
    }

    const busId = payload.busId;
    if (!user.busId || user.busId !== busId) {
      throw new WsException('Parent is not assigned to this bus');
    }

    const latitude = payload.latitude ?? payload.lat;
    const longitude = payload.longitude ?? payload.lng;
    if (latitude == null || longitude == null) {
      throw new WsException('Location coordinates are required');
    }

    const liveByParent = this.parentLiveLocations.get(busId) ?? new Map();
    liveByParent.set(user.id, {
      parentId: user.id,
      parentName: user.name || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Parent',
      childName: user.childName ?? null,
      latitude,
      longitude,
      updatedAt: Date.now(),
    });
    this.parentLiveLocations.set(busId, liveByParent);

    const bus = await this.busRepository.findOneBy({ id: busId });
    await this.emitParentLocationsToDrivers(
      busId,
      bus?.lastLat != null && bus?.lastLng != null
        ? { latitude: bus.lastLat, longitude: bus.lastLng }
        : undefined,
    );

    return {
      event: 'ack',
      data: {
        busId,
        parentId: user.id,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      },
    };
  }

  // ─── Server-initiated helpers ──────────────────────────────────────────────

  broadcastIconChange(busId: string, iconUrl: string): void {
    this.server.to(`bus:${busId}`).emit('bus_icon', { busId, iconUrl });
  }
}
