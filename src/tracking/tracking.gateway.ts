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

interface LocationPayload {
  busId: string;
  lat: number;
  lng: number;
}

interface StatusPayload {
  busId: string;
  status: BusStatus;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
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
    const bus = await this.busRepository.findOneBy({ id: payload.busId });
    if (!bus) throw new WsException('Bus not found');

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
}
