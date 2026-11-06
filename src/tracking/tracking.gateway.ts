import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Repository } from 'typeorm';
import type { Namespace, Socket } from 'socket.io';
import { Role } from '../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { User } from '../users/user.entity';
import { Trip } from './trip.entity';
import { TripStop } from './trip-stop.entity';
import { TripChanges } from './trip-changes';
import { TripsService } from './trips.service';
import { buildParentView } from './parent-view';

const THROTTLE_MS = 1_500;

/**
 * Live push: Socket.IO namespace `/live` (same port as the API). Auth = the normal access token
 * (`io(url + '/live', { auth: { token } })`).
 *
 * Rooms (joined automatically from the token):
 *   school:{schoolId}  school admins  → 'trip:update' full snapshot of every trip
 *   driver:{userId}    the driver     → 'trip:update' full snapshot of their trip
 *   stop:{routeStopId} parents        → 'parent:update' PRIVACY-FILTERED view
 *
 * Every write emits TripChanges; we push at most one snapshot per trip every 1.5 s (trailing).
 * Clients still poll slowly as a safety net. Single instance; add the Redis adapter to scale out.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: true, credentials: true } })
export class TrackingGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackingGateway.name);
  @WebSocketServer() private server!: Namespace;

  private readonly lastSent = new Map<string, number>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly listener = (tripId: string) => this.schedule(tripId);

  constructor(
    private readonly jwt: JwtService,
    private readonly changes: TripChanges,
    private readonly trips: TripsService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripStop) private readonly tripStopRepo: Repository<TripStop>,
  ) {}

  onModuleInit() {
    this.changes.on('changed', this.listener);
  }

  onModuleDestroy() {
    this.changes.off('changed', this.listener);
    for (const t of this.pending.values()) clearTimeout(t);
  }

  async handleConnection(client: Socket) {
    const raw =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    let user: JwtPayload;
    try {
      user = this.jwt.verify<JwtPayload>(raw ?? '');
    } catch {
      client.emit('auth_error', { message: 'Invalid or expired token' });
      client.disconnect(true);
      return;
    }
    client.data.user = user;
    const rooms: string[] = [];
    if (user.role === Role.SCHOOL_ADMIN && user.schoolId) rooms.push(`school:${user.schoolId}`);
    if (user.role === Role.DRIVER) rooms.push(`driver:${user.sub}`);
    if (user.role === Role.PARENT) {
      const parent = await this.userRepo.findOne({ where: { id: user.sub, isActive: true }, select: { id: true, routeStopId: true } });
      if (parent?.routeStopId) rooms.push(`stop:${parent.routeStopId}`);
    }
    await client.join(rooms);
    client.emit('ready', { rooms: rooms.map((r) => r.split(':')[0]) });
  }

  /** Throttle: first change goes out immediately, bursts collapse into one trailing push. */
  private schedule(tripId: string) {
    if (this.pending.has(tripId)) return;
    const wait = Math.max(0, (this.lastSent.get(tripId) ?? 0) + THROTTLE_MS - Date.now());
    this.pending.set(
      tripId,
      setTimeout(() => {
        this.pending.delete(tripId);
        this.lastSent.set(tripId, Date.now());
        void this.publish(tripId).catch((e: Error) => this.logger.warn(`publish ${tripId}: ${e.message}`));
      }, wait),
    );
  }

  private hasListeners(room: string): boolean {
    return (this.server?.adapter.rooms.get(room)?.size ?? 0) > 0;
  }

  private async publish(tripId: string) {
    if (!this.server) return;
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) return;

    const schoolRoom = `school:${trip.schoolId}`;
    const driverRoom = `driver:${trip.driverId}`;
    const stops = await this.tripStopRepo.find({ where: { tripId }, select: { id: true, routeStopId: true } });
    const parentRooms = stops
      .map((s) => s.routeStopId)
      .filter((rs): rs is string => !!rs && this.hasListeners(`stop:${rs}`));
    const staff = this.hasListeners(schoolRoom) || this.hasListeners(driverRoom);
    if (!staff && parentRooms.length === 0) return;

    // Build the full snapshot ONCE; parents get a filtered copy of it.
    const snap = await this.trips.snapshotOne(trip);
    if (staff) this.server.to(schoolRoom).to(driverRoom).emit('trip:update', snap);
    for (const rs of parentRooms) this.server.to(`stop:${rs}`).emit('parent:update', buildParentView(snap, rs));
  }

}
