import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { Bus } from '../buses/entities/bus.entity';

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

type StartTripOptions = {
  /** When true, clears saved progress (new outbound/return leg). */
  reset?: boolean;
};

@Injectable()
export class TripProgressService {
  private readonly logger = new Logger(TripProgressService.name);
  private readonly progressByBus = new Map<string, TripProgress>();

  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
  ) {}

  getReachedStopIds(busId: string): string[] {
    return [...(this.progressByBus.get(busId)?.reachedStopIds ?? [])];
  }

  async startTrip(
    busId: string,
    routeId: string | null | undefined,
    reverseStops: boolean = false,
    options: StartTripOptions = {},
  ): Promise<void> {
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
      .sort((a, b) => a.stopOrder - b.stopOrder);

    if (reverseStops) {
      stops.reverse();
    }

    const mappedStops = stops.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      stopOrder: s.stopOrder,
    }));

    const reset = options.reset ?? false;
    let reachedStopIds: string[] = [];

    if (reset) {
      await this.persistReachedStopIds(busId, []);
    } else {
      const bus = await this.busRepository.findOneBy({ id: busId });
      reachedStopIds = this.normalizeReachedIds(bus?.reachedStopIds);
      reachedStopIds = this.filterValidReachedIds(reachedStopIds, mappedStops);
    }

    this.progressByBus.set(busId, {
      routeId,
      stops: mappedStops,
      reachedStopIds,
    });

    this.logger.log(
      `Trip progress for bus ${busId} · ${stops.length} stops · ${reachedStopIds.length} already reached`,
    );
  }

  async endTrip(busId: string): Promise<void> {
    this.progressByBus.delete(busId);
    await this.persistReachedStopIds(busId, []);
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
  async tryAutoReach(
    busId: string,
    latitude: number,
    longitude: number,
  ): Promise<StopReachedResult | null> {
    const prog = this.progressByBus.get(busId);
    if (!prog) return null;

    const next = prog.stops.find((s) => !prog.reachedStopIds.includes(s.id));
    if (!next) return null;

    const distance = haversineMeters(latitude, longitude, next.lat, next.lng);
    if (distance > STOP_REACH_RADIUS_M) return null;

    prog.reachedStopIds.push(next.id);
    const reachedStopIds = [...prog.reachedStopIds];
    await this.persistReachedStopIds(busId, reachedStopIds);
    return { stop: next, reachedStopIds };
  }

  /**
   * Driver manually confirms arrival at the next pending stop.
   */
  async markNextStopReached(busId: string, stopId?: string): Promise<StopReachedResult | null> {
    const prog = this.progressByBus.get(busId);
    if (!prog) return null;

    const next = prog.stops.find((s) => !prog.reachedStopIds.includes(s.id));
    if (!next) return null;

    if (stopId && stopId !== next.id) {
      return null;
    }

    prog.reachedStopIds.push(next.id);
    const reachedStopIds = [...prog.reachedStopIds];
    await this.persistReachedStopIds(busId, reachedStopIds);
    return { stop: next, reachedStopIds };
  }

  async ensureTripLoaded(
    busId: string,
    routeId: string | null | undefined,
    reverseStops: boolean = false,
  ): Promise<void> {
    if (!routeId) return;

    const existing = this.progressByBus.get(busId);
    if (existing?.routeId === routeId) return;

    await this.startTrip(busId, routeId, reverseStops, { reset: false });
  }

  buildRichPayload(busId: string, activeDirection: string, status: string, lat?: number, lng?: number): Record<string, any> {
    const prog = this.progressByBus.get(busId);
    let currentStop: TripStop | null = null;
    let nextStop: TripStop | null = null;
    let completedStops: string[] = [];
    let remainingStops = 0;

    if (prog) {
      completedStops = [...prog.reachedStopIds];
      const nextIndex = prog.stops.findIndex(s => !prog.reachedStopIds.includes(s.id));
      if (nextIndex >= 0) {
        nextStop = prog.stops[nextIndex];
        currentStop = nextIndex > 0 ? prog.stops[nextIndex - 1] : null;
        remainingStops = prog.stops.length - nextIndex;
      } else {
        remainingStops = 0;
        currentStop = prog.stops.length > 0 ? prog.stops[prog.stops.length - 1] : null;
      }
    }

    let tripType = activeDirection === 'return' ? 'RETURN' : 'OUTBOUND';
    let tripStatus = 'IN_PROGRESS';
    if (status === 'ended' || status === 'idle') {
      tripStatus = tripType === 'OUTBOUND' ? 'OUTBOUND_COMPLETED' : 'RETURN_COMPLETED';
    }

    return {
      tripId: prog?.routeId || null,
      tripType,
      tripStatus,
      currentStop: currentStop?.name || null,
      nextStop: nextStop?.name || null,
      completedStops,
      remainingStops,
      eta: 'Calculating...', // Basic placeholder for ETA
      busLocation: lat != null && lng != null ? { lat, lng } : null,
    };
  }

  private normalizeReachedIds(raw: string[] | null | undefined): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  private filterValidReachedIds(ids: string[], stops: TripStop[]): string[] {
    const stopIds = new Set(stops.map((s) => s.id));
    const valid = ids.filter((id) => stopIds.has(id));
    // Enforce sequential order — only keep a prefix of stops in route order.
    const ordered: string[] = [];
    for (const stop of stops) {
      if (!valid.includes(stop.id)) break;
      ordered.push(stop.id);
    }
    return ordered;
  }

  private async persistReachedStopIds(busId: string, ids: string[]): Promise<void> {
    try {
      await this.busRepository.update(busId, { reachedStopIds: ids });
    } catch (err) {
      this.logger.error(`Failed to persist reached stops for bus ${busId}`, err);
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
