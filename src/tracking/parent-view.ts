import type { StopKind, TripDirection } from './engine/direction';

/**
 * PRIVACY FILTER for parents. A parent may see:
 *   - the bus position (while it is still coming for / carrying their child)
 *   - their OWN stop, the school, the route's start/end pins (not homes)
 *   - other stops only as anonymous slots (status, no name / location / time / students)
 * Built on the server so the parent's phone never receives other families' data.
 */

export interface FullStopLike {
  id: string;
  routeStopId: string | null;
  seq: number;
  name: string;
  address: string | null;
  kind: StopKind;
  lat: number;
  lng: number;
  status: 'pending' | 'reached' | 'skipped';
  arrivedAt: string | null;
  etaAt: string | null;
  distanceM: number | null;
}

export interface FullTripLike {
  id: string;
  status: 'in_progress' | 'completed';
  direction: TripDirection;
  routeName: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationSec: number;
  bus: { id: string; name: string; plateNumber: string } | null;
  driver: { id: string; fullName: string | null; phone: string | null } | null;
  live: { lat: number; lng: number; heading: number | null; lastPingAt: string | null } | null;
  presence: string;
  atStopId: string | null;
  nextStopId: string | null;
  stops: FullStopLike[];
}

export type ParentStop =
  | (Omit<FullStopLike, 'routeStopId'> & { hidden: false; isMine: boolean })
  | {
      id: string;
      seq: number;
      kind: 'stop';
      hidden: true;
      isMine: false;
      status: FullStopLike['status'];
      name: null;
      address: null;
      lat: null;
      lng: null;
      arrivedAt: null;
      etaAt: null;
      distanceM: null;
    };

export interface ParentTripView {
  id: string;
  status: FullTripLike['status'];
  direction: TripDirection;
  routeName: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationSec: number;
  presence: string;
  /** Bus position — null once the trip is no longer about this child (dropped / ended). */
  live: { lat: number; lng: number; heading: number | null; lastPingAt: string | null } | null;
  bus: { name: string; plateNumber: string } | null;
  driver: { fullName: string | null; phone: string | null } | null;
  myStopId: string | null;
  atStopId: string | null;
  nextStopId: string | null;
  /** Other stops before mine (count only). */
  stopsBeforeMine: { total: number; pending: number };
  stops: ParentStop[];
}

const hiddenId = (seq: number) => `hidden-${seq}`;

export function buildParentView(trip: FullTripLike, myRouteStopId: string | null): ParentTripView {
  const mine = myRouteStopId ? trip.stops.find((s) => s.routeStopId === myRouteStopId) ?? null : null;
  const visible = (s: FullStopLike) => s === mine || s.kind === 'school' || s.kind === 'end';
  const publicId = (id: string | null) => {
    const s = id ? trip.stops.find((x) => x.id === id) : undefined;
    return s ? (visible(s) ? s.id : hiddenId(s.seq)) : null;
  };

  const stops: ParentStop[] = trip.stops.map((s) =>
    visible(s)
      ? {
          id: s.id,
          seq: s.seq,
          name: s.name,
          address: s.address,
          kind: s.kind,
          lat: s.lat,
          lng: s.lng,
          status: s.status,
          arrivedAt: s.arrivedAt,
          etaAt: s.etaAt,
          distanceM: s.distanceM,
          hidden: false,
          isMine: s === mine,
        }
      : {
          id: hiddenId(s.seq),
          seq: s.seq,
          kind: 'stop',
          hidden: true,
          isMine: false,
          status: s.status,
          name: null,
          address: null,
          lat: null,
          lng: null,
          arrivedAt: null,
          etaAt: null,
          distanceM: null,
        },
  );

  const onTrip = trip.status === 'in_progress';
  const myDone = !!mine && mine.status !== 'pending';
  // Drop: once my child is off the bus, stop showing where the bus goes next.
  const showBus = onTrip && !(trip.direction === 'drop' && myDone);
  const before = mine ? trip.stops.filter((s) => s.seq < mine.seq && s.kind === 'stop') : [];

  return {
    id: trip.id,
    status: trip.status,
    direction: trip.direction,
    routeName: trip.routeName,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    endReason: trip.endReason,
    durationSec: trip.durationSec,
    presence: showBus ? trip.presence : 'not_on_trip',
    live: showBus && trip.live ? { lat: trip.live.lat, lng: trip.live.lng, heading: trip.live.heading, lastPingAt: trip.live.lastPingAt } : null,
    bus: trip.bus ? { name: trip.bus.name, plateNumber: trip.bus.plateNumber } : null,
    driver: trip.driver ? { fullName: trip.driver.fullName, phone: trip.driver.phone } : null,
    myStopId: mine?.id ?? null,
    atStopId: showBus ? publicId(trip.atStopId) : null,
    nextStopId: showBus ? publicId(trip.nextStopId) : null,
    stopsBeforeMine: { total: before.length, pending: before.filter((s) => s.status === 'pending').length },
    stops,
  };
}
