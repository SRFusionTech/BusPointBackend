import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from '../routes/entities/route.entity';

/** Bus must enter this radius (meters) of the next stop to auto-mark it reached. */
export const STOP_REACH_RADIUS_M = 100;

export type TripStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stopOrder: number;
};

type TripProgress = {
  routeId: string;
  stops: TripStop[];
  reachedStopIds: string[];
};

export type StopReachedResult = {
  stop: TripStop;
  reachedStopIds: string[];
};

@Injectable()
export class TripProgressService {
  private readonly logger = new Logger(TripProgressService.name);
  private readonly progressByBus = new Map<string, TripProgress>();

  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
  ) {}

  getReachedStopIds(busId: string): string[] {
    return [...(this.progressByBus.get(busId)?.reachedStopIds ?? [])];
  }

  async startTrip(busId: string, routeId: string | null | undefined): Promise<void> {
    if (!routeId) {
      this.progressByBus.delete(busId);
      return;
    }

    const route = await this.routeRepository.findOne({
      where: { id: routeId },
      relations: ['stops'],
    });

    if (!route) {
      this.logger.warn(`Trip start for bus ${busId}: route ${routeId} not found`);
      this.progressByBus.delete(busId);
      return;
    }

    const stops = (route.stops ?? [])
      .slice()
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        stopOrder: s.stopOrder,
      }));

    this.progressByBus.set(busId, {
      routeId,
      stops,
      reachedStopIds: [],
    });

    this.logger.log(`Trip progress started for bus ${busId} · ${stops.length} stops`);
  }

  endTrip(busId: string): void {
    this.progressByBus.delete(busId);
  }

  getNextStop(busId: string): TripStop | null {
    const prog = this.progressByBus.get(busId);
    if (!prog) return null;
    return prog.stops.find((s) => !prog.reachedStopIds.includes(s.id)) ?? null;
  }

  /**
   * Mark the next sequential stop when the bus enters the geofence.
   * Returns the newly reached stop, if any.
   */
  tryAutoReach(busId: string, latitude: number, longitude: number): StopReachedResult | null {
    const prog = this.progressByBus.get(busId);
    if (!prog) return null;

    const next = prog.stops.find((s) => !prog.reachedStopIds.includes(s.id));
    if (!next) return null;

    const distance = haversineMeters(latitude, longitude, next.lat, next.lng);
    if (distance > STOP_REACH_RADIUS_M) return null;

    prog.reachedStopIds.push(next.id);
    return { stop: next, reachedStopIds: [...prog.reachedStopIds] };
  }

  /**
   * Driver manually confirms arrival at the next pending stop.
   */
  markNextStopReached(busId: string, stopId?: string): StopReachedResult | null {
    const prog = this.progressByBus.get(busId);
    if (!prog) return null;

    const next = prog.stops.find((s) => !prog.reachedStopIds.includes(s.id));
    if (!next) return null;

    if (stopId && stopId !== next.id) {
      return null;
    }

    prog.reachedStopIds.push(next.id);
    return { stop: next, reachedStopIds: [...prog.reachedStopIds] };
  }

  ensureTripLoaded(busId: string, routeId: string | null | undefined): void {
    if (!routeId) return;
    if (!this.progressByBus.has(busId)) {
      void this.startTrip(busId, routeId);
    }
  }
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
