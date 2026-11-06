import { describe, expect, it } from 'vitest';
import { buildParentView, type FullStopLike, type FullTripLike } from './parent-view';

function stop(seq: number, kind: FullStopLike['kind'], status: FullStopLike['status'], name: string): FullStopLike {
  return {
    id: `ts-${seq}`, routeStopId: `rs-${seq}`, seq, name, address: `${name} street`, kind,
    lat: 17 + seq / 100, lng: 78, status, arrivedAt: status === 'reached' ? '2026-11-06T07:10:00Z' : null,
    etaAt: status === 'pending' ? '2026-11-06T07:40:00Z' : null, distanceM: status === 'pending' ? 1200 : null,
  };
}

function trip(direction: 'pickup' | 'drop', stops: FullStopLike[]): FullTripLike {
  return {
    id: 't1', status: 'in_progress', direction, routeName: 'R1', startedAt: '2026-11-06T07:00:00Z', endedAt: null, endReason: null,
    durationSec: 600, bus: { id: 'b', name: 'Bus 1', plateNumber: 'TS1' }, driver: { id: 'd', fullName: 'Ravi', phone: '98' },
    live: { lat: 17.02, lng: 78, heading: 90, lastPingAt: '2026-11-06T07:10:00Z' }, presence: 'live',
    atStopId: null, nextStopId: stops.find((s) => s.status === 'pending')?.id ?? null, stops,
  };
}

const PICKUP = [
  stop(0, 'end', 'reached', 'Last Stop'),
  stop(1, 'stop', 'reached', 'Sharma House'),
  stop(2, 'stop', 'pending', 'Reddy Colony'),
  stop(3, 'stop', 'pending', 'My Home'),
  stop(4, 'stop', 'pending', 'Gupta Lane'),
  stop(5, 'school', 'pending', 'DPS'),
];

describe('parent privacy view', () => {
  it('never exposes other families’ stops', () => {
    const v = buildParentView(trip('pickup', PICKUP), 'rs-3');
    const json = JSON.stringify(v);
    for (const secret of ['Sharma House', 'Reddy Colony', 'Gupta Lane', 'rs-1', 'rs-2', 'ts-1', 'ts-2', 'ts-4']) {
      expect(json).not.toContain(secret);
    }
    const hidden = v.stops.filter((s) => s.hidden);
    expect(hidden).toHaveLength(3);
    expect(hidden.every((s) => s.lat === null && s.name === null && s.arrivedAt === null)).toBe(true);
    // no student / parent data at all
    expect(json).not.toContain('students');
  });

  it('shows my stop, the school and the route start pin', () => {
    const v = buildParentView(trip('pickup', PICKUP), 'rs-3');
    expect(v.myStopId).toBe('ts-3');
    expect(v.stops.find((s) => s.isMine)?.name).toBe('My Home');
    expect(v.stops.find((s) => s.kind === 'school')?.name).toBe('DPS');
    expect(v.stops[0].name).toBe('Last Stop');
    expect(v.stopsBeforeMine).toEqual({ total: 2, pending: 1 });
    expect(v.nextStopId).toBe('hidden-2'); // next stop is someone else's → anonymous id
    expect(v.live).not.toBeNull();
  });

  it('drop: hides the bus once my child is dropped', () => {
    const drop = [stop(0, 'school', 'reached', 'DPS'), stop(1, 'stop', 'reached', 'My Home'), stop(2, 'stop', 'pending', 'Gupta Lane')];
    const v = buildParentView(trip('drop', drop), 'rs-1');
    expect(v.live).toBeNull();
    expect(v.presence).toBe('not_on_trip');
    expect(v.nextStopId).toBeNull();
  });
});
