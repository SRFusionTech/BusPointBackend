import type { PushMessage } from '../push/push.service';
import type { TripDirection } from './engine/direction';
import type { EngineStopStatus } from './engine/stop-engine';
import type { TripEventType } from './trip-event.entity';
import type { TripStatus } from './trip.entity';

/**
 * Which pushes a trip event causes. Pure (no DB): the notifier loads the trip + stops, calls these, then
 * resolves audiences to users. Texts only ever name the parent's own stop and the route — never another
 * family. SOS / emergency stay school-only (the dashboard alerts the school; it calls parents itself).
 */

export interface NotifyTrip {
  id: string;
  routeName: string;
  direction: TripDirection;
  status: TripStatus;
}

export interface NotifyStop {
  id: string;
  routeStopId: string | null;
  seq: number;
  name: string;
  status: EngineStopStatus;
  etaAt: Date | null;
  approachNotified: boolean;
}

export interface NotifyEvent {
  type: TripEventType;
  at: Date;
  payload: Record<string, unknown>;
}

/** Parents linked to these route stops, or the trip's driver. */
export type Audience = { routeStopIds: string[] } | { driver: true };

export interface Notice {
  audience: Audience;
  message: PushMessage;
}

export interface EventNotices {
  notices: Notice[];
  /** Trip stops whose "approaching" push is covered by this event (don't send it again). */
  coveredApproach: string[];
}

/** How many pending stops ahead get the "approaching" push: next stop + 2 stops away. */
export const APPROACH_WINDOW = 2;
const TRIP_TTL_MS = 15 * 60_000;
const ALERT_TTL_MS = 60 * 60_000;
const CHECK_IN_TTL_MS = 5 * 60_000;

const tripTag = (trip: NotifyTrip) => `trip-${trip.id}`;

function tripUpdate(trip: NotifyTrip, type: string, screen: PushMessage['screen'], title: string, body: string): PushMessage {
  return { title, body, channel: 'trip-updates', type, screen, data: { tripId: trip.id }, tag: tripTag(trip), ttlMs: TRIP_TTL_MS };
}

function safetyAlert(trip: NotifyTrip, type: string, title: string, body: string): PushMessage {
  return { title, body, channel: 'safety-alerts', type, screen: 'Trip', data: { tripId: trip.id }, ttlMs: ALERT_TTL_MS };
}

const byStops = (stops: NotifyStop[]): Audience => ({
  routeStopIds: [...new Set(stops.map((s) => s.routeStopId).filter((x): x is string => !!x))],
});

const hasParents = (a: Audience) => 'driver' in a || a.routeStopIds.length > 0;

export function pendingInOrder(stops: NotifyStop[]): NotifyStop[] {
  return stops.filter((s) => s.status === 'pending').sort((a, b) => a.seq - b.seq);
}

function etaText(stop: NotifyStop, now: Date): string {
  if (!stop.etaAt) return '';
  const min = Math.max(1, Math.round((stop.etaAt.getTime() - now.getTime()) / 60_000));
  return ` (about ${min} min)`;
}

function approachMessage(trip: NotifyTrip, stop: NotifyStop, position: number, now: Date): PushMessage {
  return position === 0
    ? tripUpdate(trip, 'bus_approaching', 'Map', 'Your stop is next', `The bus is heading to ${stop.name}${etaText(stop, now)}.`)
    : tripUpdate(trip, 'bus_approaching', 'Map', 'Bus is 2 stops away', `Get ready — the bus is 2 stops from ${stop.name}${etaText(stop, now)}.`);
}

export function noticesForEvent(event: NotifyEvent, trip: NotifyTrip, stops: NotifyStop[], now: Date): EventNotices {
  const none: EventNotices = { notices: [], coveredApproach: [] };
  const stopOf = (id: unknown) => stops.find((s) => s.id === id);
  const notices: Notice[] = [];
  const add = (audience: Audience, message: PushMessage) => {
    if (hasParents(audience)) notices.push({ audience, message });
  };

  switch (event.type) {
    case 'started': {
      // The first stop (seq 0) is where the bus already is — it gets "at your stop" from stop_reached.
      const window = pendingInOrder(stops).slice(0, APPROACH_WINDOW);
      const rest = stops.filter((s) => s.seq > 0 && !window.includes(s));
      const title = trip.direction === 'pickup' ? 'Bus is on its way' : 'Drop-off trip has started';
      window.forEach((s, i) =>
        add(
          byStops([s]),
          tripUpdate(trip, 'trip_started', 'Map', title, i === 0 ? `${s.name} is the next stop — please be ready${etaText(s, now)}.` : `The bus is 2 stops from ${s.name}${etaText(s, now)}.`),
        ),
      );
      add(byStops(rest), tripUpdate(trip, 'trip_started', 'Map', title, `${trip.routeName} has started. We'll tell you when it's 2 stops away.`));
      return { notices, coveredApproach: window.map((s) => s.id) };
    }

    case 'stop_reached': {
      const stop = stopOf(event.payload.stopId);
      if (!stop) return none;
      add(
        byStops([stop]),
        trip.direction === 'pickup'
          ? tripUpdate(trip, 'stop_reached', 'Trip', 'Bus is at your stop', `The bus has reached ${stop.name}.`)
          : tripUpdate(trip, 'stop_reached', 'Trip', 'Bus has reached your stop', `The bus is at ${stop.name} for drop-off.`),
      );
      return { notices, coveredApproach: [] };
    }

    case 'stop_skipped': {
      const stop = stopOf(event.payload.stopId);
      if (!stop) return none;
      // With a reason = skipped because the trip ended; without = the bus went past it.
      add(
        byStops([stop]),
        event.payload.reason
          ? safetyAlert(trip, 'trip_ended_early', 'Trip ended before your stop', `${trip.routeName} ended its trip before reaching ${stop.name}. Please contact the school.`)
          : safetyAlert(trip, 'stop_passed', 'Bus passed your stop', `The bus went past ${stop.name} without stopping. Please contact the school.`),
      );
      return { notices, coveredApproach: [] };
    }

    case 'ended': {
      // Drop-off parents already got "reached your stop"; an abandoned trip (no GPS) says nothing reliable.
      if (trip.direction !== 'pickup' || event.payload.reason === 'auto_timeout') return none;
      const onBoard = stops.filter((s) => s.status === 'reached');
      add(
        byStops(onBoard),
        event.payload.reason === 'last_stop'
          ? tripUpdate(trip, 'arrived_school', 'Trip', 'Bus has reached school', `${trip.routeName} has arrived at school.`)
          : tripUpdate(trip, 'trip_ended', 'Trip', 'Bus trip has ended', `${trip.routeName} has finished its trip.`),
      );
      return { notices, coveredApproach: [] };
    }

    case 'check_in': {
      if (event.payload.response !== 'breakdown') return none;
      // Pickup: children on board + those waiting. Drop-off: only those not home yet.
      const affected = trip.direction === 'pickup' ? stops : stops.filter((s) => s.status === 'pending');
      add(byStops(affected), safetyAlert(trip, 'bus_delayed', 'Bus delayed', `${trip.routeName} has broken down. The school has been informed.`));
      return { notices, coveredApproach: [] };
    }

    case 'check_in_requested': {
      const minutes = Number(event.payload.minutes) || null;
      add(
        { driver: true },
        {
          ...safetyAlert(trip, 'check_in_requested', 'Bus stopped — is everything OK?', minutes ? `Not moving for ${minutes} min. Tap to reply.` : 'Tap to reply.'),
          tag: `check-in-${trip.id}`,
          ttlMs: CHECK_IN_TTL_MS,
        },
      );
      return { notices, coveredApproach: [] };
    }

    default:
      return none;
  }
}

/** "Your stop is next" / "2 stops away" for upcoming stops that haven't had it yet. */
export function approachNotices(trip: NotifyTrip, stops: NotifyStop[], now: Date): { stopId: string; notice: Notice | null }[] {
  if (trip.status !== 'in_progress') return [];
  return pendingInOrder(stops)
    .slice(0, APPROACH_WINDOW)
    .map((stop, i) => ({ stop, i }))
    .filter(({ stop }) => !stop.approachNotified)
    .map(({ stop, i }) => ({
      stopId: stop.id,
      notice: stop.routeStopId ? { audience: byStops([stop]), message: approachMessage(trip, stop, i, now) } : null,
    }));
}
