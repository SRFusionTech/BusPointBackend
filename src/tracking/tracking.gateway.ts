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
import { TripProgressService } from './trip-progress.service';
import { isUsableDriverCoordinate } from '../common/utils/location-quality';

// ─── Payload shapes ───────────────────────────────────────────────────────────

interface LocationPayload {
  busId: string;
  driverId?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
  timestamp?: string;
}

interface StatusPayload {
  busId: string;
  status: BusStatus;
  direction?: 'outbound' | 'return';
}

interface MarkStopPayload {
  busId: string;
  stopId?: string;
}

const TRIP_ACTIVE_STATUSES = new Set<BusStatus>([
  BusStatus.STARTED,
  BusStatus.RETURNING,
  BusStatus.AT_SCHOOL,
]);

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
  /** true when coords came from a live `parent_location_update`; absent/false for saved home coords. */
  isLive?: boolean;
  /** epoch ms of the most recent live emit; only set when `isLive` is true. */
  liveUpdatedAt?: number;
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
   * socketId → busId — tracks which bus a driver socket is broadcasting for.
   * Cleared on disconnect; GPS loss is detected via heartbeat timeout instead.
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
    private readonly tripProgress: TripProgressService,
  ) {}

  // ─── Heartbeat helpers ────────────────────────────────────────────────────

  private isTripActive(status: BusStatus): boolean {
    return TRIP_ACTIVE_STATUSES.has(status);
  }

  /** Reverse stop order when return uses the same route as outbound (or no separate return route). */
  private shouldReverseStopsForBus(bus: Bus | null | undefined): boolean {
    if (!bus || bus.activeDirection !== 'return') return false;
    return !bus.returnRouteId || bus.routeId === bus.returnRouteId;
  }

  private emitStopReached(
    busId: string,
    result: { stop: { id: string; name: string; stopOrder: number }; reachedStopIds: string[] },
  ): void {
    this.server.to(`bus:${busId}`).emit('bus_stop_reached', {
      busId,
      stopId: result.stop.id,
      stopName: result.stop.name,
      stopOrder: result.stop.stopOrder,
      reachedStopIds: result.reachedStopIds,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(
      `Bus ${busId} reached stop ${result.stop.name} (${result.reachedStopIds.length} total)`,
    );
  }

  private async syncTripProgressFromStatus(busId: string, status: BusStatus, routeId: string | null): Promise<void> {
    const bus = await this.busRepository.findOneBy({ id: busId });
    const reverseStops = this.shouldReverseStopsForBus(bus);

    if (status === BusStatus.STARTED) {
      await this.tripProgress.startTrip(busId, routeId, reverseStops, { reset: true });
      return;
    }
    if (status === BusStatus.ENDED || status === BusStatus.IDLE) {
      await this.tripProgress.endTrip(busId);
    }
  }

  private async processStopGeofence(
    busId: string,
    latitude: number,
    longitude: number,
    routeId: string | null,
    status: BusStatus,
  ): Promise<void> {
    if (!this.isTripActive(status)) return;
    const bus = await this.busRepository.findOneBy({ id: busId });
    await this.tripProgress.ensureTripLoaded(busId, routeId, this.shouldReverseStopsForBus(bus));
    const reached = await this.tripProgress.tryAutoReach(busId, latitude, longitude);
    if (reached) {
      this.emitStopReached(busId, reached);
    }
  }

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
        isLive: true,
        liveUpdatedAt: live.updatedAt,
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

    // Driver socket dropped — do not mark GPS_LOST here. Background HTTP may
    // still be posting location; heartbeat timeout handles true signal loss.
    if (user?.role === UserRole.DRIVER) {
      const busId = this.driverBusMap.get(client.id);
      if (busId) {
        this.driverBusMap.delete(client.id);
        this.removeDriverSocket(client.id);
        this.logger.log(`Driver socket ${client.id} left bus ${busId} (trip may still be broadcasting via HTTP)`);
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
    if (this.isTripActive(bus.status)) {
      await this.tripProgress.ensureTripLoaded(
        bus.id,
        bus.activeRouteId || bus.routeId,
        this.shouldReverseStopsForBus(bus),
      );
    }

    const reachedStopIds = this.tripProgress.getReachedStopIds(bus.id);

    return {
      event: 'bus_snapshot',
      data: {
        busId:       bus.id,
        latitude:    bus.lastLat,
        longitude:   bus.lastLng,
        lat:         bus.lastLat,
        lng:         bus.lastLng,
        status:      bus.status,
        activeRouteId: bus.activeRouteId ?? bus.routeId ?? null,
        activeDirection: bus.activeDirection ?? 'outbound',
        lastUpdated: bus.lastUpdated?.toISOString() ?? null,
        iconUrl:     bus.iconUrl,
        reachedStopIds,
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

    try {
      // Cache driver→bus check on the socket so we don't re-query every emit.
      const verifyCached = client.data.verifiedBusId === payload.busId;
      const result = await this.ingestDriverLocation(user, payload, { skipAssignmentCheck: verifyCached });
      client.data.verifiedBusId = payload.busId;
      this.driverBusMap.set(client.id, payload.busId);
      return { event: 'ack', data: result };
    } catch (e) {
      if (e instanceof Error) throw new WsException(e.message);
      throw e;
    }
  }

  /**
   * Shared driver-location ingest path. Used by both the WS `location_update`
   * handler and the HTTP `POST /tracking/location` controller (the controller
   * is needed because Android background tasks can't reliably keep a WebSocket
   * open). Returns the broadcast payload or an info object on stale drops.
   */
  async ingestDriverLocation(
    user: User,
    payload: LocationPayload,
    opts: { skipAssignmentCheck?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    if (user.role !== UserRole.DRIVER) {
      throw new Error('Only drivers can push location updates');
    }

    const { busId } = payload;
    const latitude = payload.latitude ?? payload.lat;
    const longitude = payload.longitude ?? payload.lng;
    if (latitude == null || longitude == null) {
      throw new Error('Location coordinates are required');
    }
    if (!isUsableDriverCoordinate(latitude, longitude)) {
      return {
        busId,
        dropped: true,
        reason: 'mock_or_invalid_coordinate',
      };
    }

    const bus = await this.busRepository.findOneBy({ id: busId });
    if (!bus) throw new Error('Bus not found');

    if (!opts.skipAssignmentCheck) {
      const assignment = await this.busDriverRepository.findOne({
        where: { driverId: user.id, busId, isActive: true },
      });
      if (!assignment) throw new Error(`Driver ${user.id} is not assigned to bus ${busId}`);
    }

    const now = new Date();
    const payloadTime = payload.timestamp ? new Date(payload.timestamp) : now;
    const incomingTime = Number.isNaN(payloadTime.getTime()) ? now : payloadTime;

    if (bus.lastUpdated && incomingTime.getTime() + 1500 < bus.lastUpdated.getTime()) {
      return {
        busId,
        dropped: true,
        reason: 'stale_update',
        latestTimestamp: bus.lastUpdated.toISOString(),
      };
    }

    await this.busRepository.update(busId, {
      lastLat: latitude,
      lastLng: longitude,
      lastUpdated: incomingTime,
      status: bus.status === BusStatus.GPS_LOST ? BusStatus.STARTED : bus.status,
    });

    this.resetHeartbeat(busId);

    const heading =
      typeof payload.heading === 'number' && Number.isFinite(payload.heading)
        ? payload.heading
        : undefined;

    const broadcastPayload = {
      busId,
      driverId: user.id,
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      ...(heading !== undefined ? { heading } : {}),
      timestamp: incomingTime.toISOString(),
      ...this.tripProgress.buildRichPayload(busId, bus.activeDirection || 'outbound', bus.status, latitude, longitude),
    };

    this.server.to(`bus:${busId}`).emit('bus_location', broadcastPayload);
    await this.emitParentLocationsToDrivers(busId, { latitude, longitude });

    const liveStatus = bus.status === BusStatus.GPS_LOST ? BusStatus.STARTED : bus.status;
    await this.processStopGeofence(busId, latitude, longitude, bus.activeRouteId || bus.routeId, liveStatus);

    return broadcastPayload;
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

    const { busId, status, direction } = payload;

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

    let activeRouteId: string | null = bus.activeRouteId;
    let activeDirection: string = bus.activeDirection || 'outbound';

    if (status === BusStatus.STARTED) {
      activeRouteId = direction === 'return' ? (bus.returnRouteId || bus.routeId || null) : (bus.routeId || null);
      activeDirection = direction === 'return' ? 'return' : 'outbound';
    } else if (status === BusStatus.ENDED || status === BusStatus.IDLE) {
      const hasReturn = !!(bus.returnRouteId || bus.returnRouteName);
      if (activeDirection === 'outbound' && hasReturn) {
        activeRouteId = bus.returnRouteId || bus.routeId || null;
        activeDirection = 'return';
      } else if (activeDirection === 'return') {
        activeRouteId = bus.routeId || bus.returnRouteId || null;
        activeDirection = 'outbound';
      }
    }

    await this.busRepository.update(busId, { status, activeRouteId: activeRouteId as any, activeDirection: activeDirection as any });

    await this.syncTripProgressFromStatus(busId, status, activeRouteId);

    // Clear the heartbeat when the trip is over
    if (status === BusStatus.ENDED || status === BusStatus.IDLE) {
      this.clearHeartbeat(busId);
      this.driverBusMap.delete(client.id);
    }

    const broadcastPayload = {
      busId,
      status,
      activeRouteId,
      activeDirection,
      timestamp: new Date().toISOString(),
      ...this.tripProgress.buildRichPayload(busId, activeDirection, status, bus.lastLat || undefined, bus.lastLng || undefined),
    };

    this.server.to(`bus:${busId}`).emit('bus_status', broadcastPayload);

    // Emit TRIP_TYPE_CHANGED if a return trip just started
    if (status === BusStatus.STARTED && activeDirection === 'return' && bus.activeDirection !== 'return') {
      this.server.to(`bus:${busId}`).emit('TRIP_TYPE_CHANGED', broadcastPayload);
    }

    return { event: 'ack', data: broadcastPayload };
  }

  // ─── Driver: manually mark next stop reached (fallback to auto geofence) ──

  @SubscribeMessage('mark_stop_reached')
  async handleMarkStopReached(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkStopPayload,
  ): Promise<{ event: string; data: object }> {
    const user = client.data.user as User;
    if (user.role !== UserRole.DRIVER) {
      throw new WsException('Only drivers can mark stops reached');
    }

    const { busId, stopId } = payload;
    const assignment = await this.busDriverRepository.findOne({
      where: { driverId: user.id, busId, isActive: true },
    });
    if (!assignment) {
      throw new WsException(`Driver ${user.id} is not assigned to bus ${busId}`);
    }

    const bus = await this.busRepository.findOneBy({ id: busId });
    if (!bus) throw new WsException('Bus not found');

    await this.tripProgress.ensureTripLoaded(
      busId,
      bus.activeRouteId || bus.routeId,
      this.shouldReverseStopsForBus(bus),
    );
    const result = await this.tripProgress.markNextStopReached(busId, stopId);
    if (!result) {
      throw new WsException('No pending stop to mark or stop out of order');
    }

    this.emitStopReached(busId, result);

    return {
      event: 'ack',
      data: {
        busId,
        stopId: result.stop.id,
        stopName: result.stop.name,
        reachedStopIds: result.reachedStopIds,
      },
    };
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
