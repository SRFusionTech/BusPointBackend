import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { User, UserRole } from '../users/entities/user.entity';

interface LocationBody {
  busId: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
  timestamp?: string;
}

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingGateway: TrackingGateway) {}

  // POST /api/tracking/location — used by the driver mobile app's background
  // location task on Android/iOS, where keeping a Socket.io connection alive
  // is unreliable. The body shape mirrors the `location_update` WS event.
  @Post('location')
  @HttpCode(HttpStatus.OK)
  async pushLocation(@Req() req: { user: User }, @Body() body: LocationBody) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (user.role !== UserRole.DRIVER) {
      throw new UnauthorizedException('Only drivers can push location updates');
    }
    if (!body?.busId) throw new BadRequestException('busId is required');
    try {
      const result = await this.trackingGateway.ingestDriverLocation(user, body);
      return { ok: true, data: result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to push location';
      throw new BadRequestException(msg);
    }
  }
}
