import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Trip } from './trip.entity';
import { TripStop } from './trip-stop.entity';
import type { TripEventType } from './trip-event.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { PushService } from '../push/push.service';
import { TripChanges } from './trip-changes';
import { approachNotices, Notice, noticesForEvent, NotifyEvent, NotifyStop, NotifyTrip } from './trip-notifications';

const SWEEP_MS = 15_000;
const BATCH = 200;
/** Events older than this are marked handled without a push (backend was down — the news is stale). */
const STALE_MS = 15 * 60_000;
const STOP_EVENTS = new Set<TripEventType>(['started', 'stop_reached', 'stop_skipped']);

interface ClaimedEvent {
  id: string;
  trip_id: string;
  type: TripEventType;
  at: Date | string;
  payload: Record<string, unknown> | null;
}

/**
 * Turns trip events into push notifications. `trip_events` is the outbox: every writer already inserts
 * events and then signals `TripChanges`; this claims unhandled rows (`notified_at IS NULL`), so each event
 * pushes at most once, survives restarts, and covers writers added later. A 15 s sweep is the fallback.
 * Texts / audiences: trip-notifications.ts.
 */
@Injectable()
export class TripNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripNotifierService.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private again = false;
  private readonly onChanged = () => this.schedule();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripStop) private readonly stopRepo: Repository<TripStop>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly push: PushService,
    private readonly changes: TripChanges,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.changes.on('changed', this.onChanged);
    this.timer = setInterval(() => this.schedule(), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    this.changes.off('changed', this.onChanged);
    if (this.timer) clearInterval(this.timer);
  }

  /** Coalesces bursts of trip changes into one drain at a time. */
  schedule() {
    if (this.draining) {
      this.again = true;
      return;
    }
    this.draining = true;
    setImmediate(() => void this.runDrain());
  }

  private async runDrain() {
    try {
      do {
        this.again = false;
        await this.drain();
      } while (this.again);
    } catch (err) {
      this.logger.warn(`push drain failed: ${(err as Error).message}`);
    } finally {
      this.draining = false;
    }
  }

  async drain(now = new Date()): Promise<void> {
    for (;;) {
      const events = await this.claim();
      if (events.length === 0) return;
      if (this.push.enabled) {
        const fresh = events.filter((e) => now.getTime() - new Date(e.at).getTime() <= STALE_MS);
        const byTrip = new Map<string, ClaimedEvent[]>();
        for (const e of fresh) byTrip.set(e.trip_id, [...(byTrip.get(e.trip_id) ?? []), e]);
        for (const [tripId, list] of byTrip) {
          try {
            await this.handleTrip(tripId, list, now);
          } catch (err) {
            this.logger.warn(`push for trip ${tripId} failed: ${(err as Error).message}`);
          }
        }
      }
      if (events.length < BATCH) return;
    }
  }

  /** Atomically marks a batch handled and returns it (SKIP LOCKED: safe with overlapping drains). */
  private async claim(): Promise<ClaimedEvent[]> {
    const res: unknown = await this.dataSource.query(
      `UPDATE trip_events SET notified_at = now()
        WHERE id IN (SELECT id FROM trip_events WHERE notified_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, trip_id, type, at, payload`,
      [BATCH],
    );
    // The pg driver via TypeORM returns [rows, affected] for UPDATE.
    const rows = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res;
    return ((rows as ClaimedEvent[]) ?? []).sort((a, b) => Number(a.id) - Number(b.id));
  }

  private async handleTrip(tripId: string, events: ClaimedEvent[], now: Date) {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      select: { id: true, routeName: true, direction: true, status: true, driverId: true },
    });
    if (!trip) return;
    const rows = await this.stopRepo.find({
      where: { tripId },
      select: { id: true, routeStopId: true, seq: true, name: true, status: true, etaAt: true, approachNotifiedAt: true },
      order: { seq: 'ASC' },
    });
    const t: NotifyTrip = { id: trip.id, routeName: trip.routeName, direction: trip.direction, status: trip.status };
    const stops: NotifyStop[] = rows.map((s) => ({
      id: s.id,
      routeStopId: s.routeStopId,
      seq: s.seq,
      name: s.name,
      status: s.status,
      etaAt: s.etaAt,
      approachNotified: !!s.approachNotifiedAt,
    }));

    const notices: Notice[] = [];
    const covered: string[] = [];
    for (const e of events) {
      const ev: NotifyEvent = { type: e.type, at: new Date(e.at), payload: e.payload ?? {} };
      const out = noticesForEvent(ev, t, stops, now);
      notices.push(...out.notices);
      covered.push(...out.coveredApproach);
    }
    if (covered.length > 0) {
      await this.claimApproach(covered);
      for (const s of stops) if (covered.includes(s.id)) s.approachNotified = true;
    }
    if (events.some((e) => STOP_EVENTS.has(e.type))) {
      const due = approachNotices(t, stops, now);
      const claimed = new Set(await this.claimApproach(due.map((d) => d.stopId)));
      for (const d of due) if (d.notice && claimed.has(d.stopId)) notices.push(d.notice);
    }
    if (notices.length === 0) return;

    const routeStopIds = [...new Set(notices.flatMap((n) => ('routeStopIds' in n.audience ? n.audience.routeStopIds : [])))];
    const parents = routeStopIds.length
      ? await this.userRepo.find({
          where: { role: Role.PARENT, isActive: true, routeStopId: In(routeStopIds) },
          select: { id: true, routeStopId: true },
        })
      : [];
    for (const n of notices) {
      const userIds =
        'driver' in n.audience
          ? [trip.driverId]
          : parents.filter((p) => p.routeStopId && (n.audience as { routeStopIds: string[] }).routeStopIds.includes(p.routeStopId)).map((p) => p.id);
      const sent = await this.push.sendToUsers(userIds, n.message);
      this.logger.log(`push ${n.message.type} trip ${tripId}: ${userIds.length} user(s), ${sent} device(s)`);
    }
  }

  /** Sets approach_notified_at once; returns the stop ids this call won. */
  private async claimApproach(stopIds: string[]): Promise<string[]> {
    if (stopIds.length === 0) return [];
    const res: unknown = await this.dataSource.query(
      `UPDATE trip_stops SET approach_notified_at = now() WHERE id = ANY($1::uuid[]) AND approach_notified_at IS NULL RETURNING id`,
      [stopIds],
    );
    const rows = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res;
    return ((rows as { id: string }[]) ?? []).map((r) => r.id);
  }
}
