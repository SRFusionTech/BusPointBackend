import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Trip } from './trip.entity';
import { TripStop } from './trip-stop.entity';
import { TripEvent } from './trip-event.entity';
import { TripsService } from './trips.service';
import { TripChanges } from './trip-changes';
import { distanceM } from './engine/geo';
import { stopRadiusM } from './engine/stop-engine';
import { stationaryAction } from './engine/stationary';
import type { TrackingSettings } from './tracking-settings';

const TICK_MS = 30_000;

/**
 * Safety checks over running trips, every 30 s:
 *  - GPS lost:    no point for `offlineAfterSec`         → alert (cleared when points resume)
 *  - Not moving:  inside 50 m for `stationaryAlertSec`, not at a stop → ask the driver "Everything OK?";
 *                 school alerted if no reply in `checkInTimeoutSec`, reply = breakdown/emergency,
 *                 or still not moving after `stationaryEscalateSec`
 *  - Abandoned:   no point for `autoTimeoutSec`          → trip auto-closed
 * Runs on the server so it still works when the driver's phone is dead / app killed.
 * (Single-instance for now; with several API instances, move to a job queue / advisory lock.)
 */
@Injectable()
export class TripMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripStop) private readonly stopRepo: Repository<TripStop>,
    @InjectRepository(TripEvent) private readonly eventRepo: Repository<TripEvent>,
    private readonly trips: TripsService,
    private readonly changes: TripChanges,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const trips = await this.tripRepo.find({ where: { status: 'in_progress' } });
      if (trips.length === 0) return;
      const stops = await this.stopRepo.find({ where: { tripId: In(trips.map((x) => x.id)) } });
      const settingsCache = new Map<string, TrackingSettings>();
      for (const trip of trips) {
        if (!settingsCache.has(trip.schoolId)) settingsCache.set(trip.schoolId, await this.trips.settingsFor(trip.schoolId));
        await this.check(trip, stops.filter((s) => s.tripId === trip.id), settingsCache.get(trip.schoolId)!, now);
      }
    } catch (err) {
      this.logger.warn(`Monitor tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async check(trip: Trip, stops: TripStop[], s: TrackingSettings, now: Date) {
    const lastAt = trip.lastPingAt ?? trip.startedAt;
    const silentSec = (now.getTime() - lastAt.getTime()) / 1000;

    if (silentSec >= s.autoTimeoutSec) {
      await this.trips.autoClose(trip.id, now);
      return;
    }

    if (silentSec >= s.offlineAfterSec) {
      // Conditional update = fires once per outage even if ticks overlap.
      const cutoff = new Date(now.getTime() - s.offlineAfterSec * 1000);
      const res = await this.tripRepo.update(
        { id: trip.id, gpsLostAt: IsNull(), status: 'in_progress', ...(trip.lastPingAt && { lastPingAt: LessThanOrEqual(cutoff) }) },
        { gpsLostAt: now },
      );
      if (res.affected) {
        await this.eventRepo.insert({ tripId: trip.id, type: 'gps_lost', at: now, payload: { lastPingAt: lastAt.toISOString() } });
        this.logger.warn(`Trip ${trip.id}: GPS lost`);
        this.changes.changed(trip.id);
      }
      return; // can't judge "not moving" without fresh points
    }

    const since = trip.stationarySince;
    if (!since || trip.lastLat == null || trip.lastLng == null) return;
    const stillSec = (now.getTime() - since.getTime()) / 1000;
    if (stillSec < s.stationaryAlertSec) return;
    const here = { lat: trip.lastLat, lng: trip.lastLng };
    const atAStop = stops.some((st) => distanceM(here, st) <= stopRadiusM(st, s));
    const minutes = Math.round(stillSec / 60);
    const askedThisWindow = !!trip.checkInRequestedAt && trip.checkInRequestedAt >= since;
    const action = stationaryAction(
      {
        stillSec,
        atAStop,
        askedThisWindow,
        alertedThisWindow: !!trip.stationaryAlertAt && trip.stationaryAlertAt >= since,
        replied: askedThisWindow && !!trip.checkInResponse,
        secsSinceAsked: askedThisWindow ? (now.getTime() - trip.checkInRequestedAt!.getTime()) / 1000 : 0,
      },
      s,
    );
    if (action === 'none') return;

    if (action === 'ask_driver') {
      // Step 1: ask the driver first — most stops are traffic / waiting for a child.
      await this.tripRepo.update({ id: trip.id }, { checkInRequestedAt: now, checkInResponse: null, checkInRespondedAt: null });
      await this.eventRepo.insert({ tripId: trip.id, type: 'check_in_requested', at: now, payload: { since: since.toISOString(), minutes } });
      this.logger.log(`Trip ${trip.id}: not moving ${minutes} min — asked driver`);
      this.changes.changed(trip.id);
      return;
    }
    const noReply = askedThisWindow && !trip.checkInResponse && stillSec < s.stationaryEscalateSec;

    // Step 2: alert the school.
    await this.tripRepo.update({ id: trip.id }, { stationaryAlertAt: now });
    await this.eventRepo.insert({
      tripId: trip.id,
      type: 'stationary',
      at: now,
      payload: { since: since.toISOString(), minutes, reason: noReply ? 'no_reply' : 'too_long', response: trip.checkInResponse ?? 'none', lat: here.lat, lng: here.lng },
    });
    this.logger.warn(`Trip ${trip.id}: not moving ${minutes} min — school alerted (${noReply ? 'no reply' : 'too long'})`);
    this.changes.changed(trip.id);
  }
}
