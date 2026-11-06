import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACKING_SETTINGS as S } from '../tracking-settings';
import { detectDirection, plannedStops, type RouteStopLike } from './direction';
import { computeEtas } from './eta';
import { distanceM, type LatLng } from './geo';
import { presenceOf } from './presence';
import { initialEngineState, processPoints, type EngineStop, type GpsPoint } from './stop-engine';

// Route stored like the backend stores it: school → stops → Last Stop. ~1.1 km apart, north-south line.
const ROUTE: RouteStopLike[] = [
  { id: 'school', name: 'School', kind: 'school', stopOrder: 0, lat: 17.4, lng: 78.4, address: null },
  { id: 's1', name: 'Stop 1', kind: 'stop', stopOrder: 1, lat: 17.41, lng: 78.4, address: null },
  { id: 's2', name: 'Stop 2', kind: 'stop', stopOrder: 2, lat: 17.42, lng: 78.4, address: null },
  { id: 's3', name: 'Stop 3', kind: 'stop', stopOrder: 3, lat: 17.43, lng: 78.4, address: null },
  { id: 'end', name: 'Last Stop', kind: 'end', stopOrder: 4, lat: 17.44, lng: 78.4, address: null },
];

const T0 = Date.parse('2026-11-06T07:00:00Z');
const NOW_AFTER = new Date('2026-11-06T09:00:00Z');

function engineStops(route: RouteStopLike[]): EngineStop[] {
  return route.map((r, seq) => ({ id: r.id, kind: r.kind, lat: r.lat, lng: r.lng, seq, status: 'pending', arrivedAt: null }));
}

/** Drive through `waypoints` at ~30 km/h, one point every 6 s (~50 m). */
function drive(waypoints: LatLng[], startMs = T0, accuracy = 10): GpsPoint[] {
  const pts: GpsPoint[] = [];
  let t = startMs;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const steps = Math.max(1, Math.round(distanceM(a, b) / 50));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      pts.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, accuracy, speed: 8.3, recordedAt: new Date(t).toISOString() });
      t += 6000;
    }
  }
  const z = waypoints[waypoints.length - 1];
  pts.push({ ...z, accuracy, speed: 0, recordedAt: new Date(t).toISOString() });
  return pts;
}

describe('direction', () => {
  const routes = { pickup: ROUTE, drop: ROUTE };

  it('starting at the school → drop, stops in stored order', () => {
    const { chosen } = detectDirection({ lat: 17.4005, lng: 78.4 }, routes, S);
    expect(chosen?.direction).toBe('drop');
    expect(plannedStops(ROUTE, 'drop').map((x) => x.id)).toEqual(['school', 's1', 's2', 's3', 'end']);
  });

  it('starting at the far end → pickup, stops reversed (ends at school)', () => {
    const { chosen } = detectDirection({ lat: 17.4398, lng: 78.4 }, routes, S);
    expect(chosen?.direction).toBe('pickup');
    expect(plannedStops(ROUTE, 'pickup').map((x) => x.id)).toEqual(['end', 's3', 's2', 's1', 'school']);
  });

  it('anywhere else → cannot start, distances reported', () => {
    const { chosen, candidates } = detectDirection({ lat: 17.42, lng: 78.4 }, routes, S);
    expect(chosen).toBeNull();
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.distanceM > 1000)).toBe(true);
  });

  it('GPS accuracy is credited (capped)', () => {
    // ~170 m from the far end: outside 150 m, but ±30 m accuracy → 140 m → inside
    const p = { lat: 17.44 - 0.00153, lng: 78.4 };
    expect(detectDirection({ ...p, accuracy: 0 }, routes, S).chosen).toBeNull();
    expect(detectDirection({ ...p, accuracy: 30 }, routes, S).chosen?.direction).toBe('pickup');
    // A terrible fix can't claim more than the 50 m cap
    expect(detectDirection({ lat: 17.44 - 0.0025, lng: 78.4, accuracy: 90 }, routes, S).chosen).toBeNull();
  });
});

describe('stop engine', () => {
  it('ticks every stop in order and completes at the last one', () => {
    const stops = engineStops(plannedStops(ROUTE, 'pickup'));
    stops[0].status = 'reached'; // origin is reached at start
    const pts = drive(plannedStops(ROUTE, 'pickup'));
    const r = processPoints(stops, initialEngineState(pts[0]), pts.slice(1), S, NOW_AFTER);
    expect(r.stops.map((x) => x.status)).toEqual(['reached', 'reached', 'reached', 'reached', 'reached']);
    expect(r.events.filter((e) => e.type === 'stop_reached').map((e) => (e as { stopId: string }).stopId)).toEqual(['s3', 's2', 's1', 'school']);
    expect(r.completedAt).not.toBeNull();
    expect(r.state.distanceM).toBeGreaterThan(4000);
    expect(r.state.distanceM).toBeLessThan(4800);
  });

  it('marks a stop skipped when the bus reaches a later stop without passing it', () => {
    const route = ROUTE.map((x) => (x.id === 's2' ? { ...x, lng: 78.41 } : x)); // s2 ~1 km off the road
    const stops = engineStops(plannedStops(route, 'drop'));
    stops[0].status = 'reached';
    const path = plannedStops(ROUTE, 'drop'); // drives straight, never near the moved s2
    const pts = drive(path);
    const r = processPoints(stops, initialEngineState(pts[0]), pts.slice(1), S, NOW_AFTER);
    expect(r.stops.find((x) => x.id === 's2')?.status).toBe('skipped');
    expect(r.stops.find((x) => x.id === 's3')?.status).toBe('reached');
    expect(r.events.some((e) => e.type === 'stop_skipped')).toBe(true);
  });

  it('one GPS jump into a stop circle does not tick it', () => {
    const stops = engineStops(plannedStops(ROUTE, 'drop'));
    stops[0].status = 'reached';
    const t = (s: number) => new Date(T0 + s * 1000).toISOString();
    const pts: GpsPoint[] = [
      { lat: 17.405, lng: 78.4, accuracy: 10, recordedAt: t(0) },
      { lat: 17.4095, lng: 78.4, accuracy: 10, recordedAt: t(60) }, // inside s1 once
      { lat: 17.405, lng: 78.4, accuracy: 10, recordedAt: t(120) }, // back out
    ];
    const r = processPoints(stops, initialEngineState(), pts, S, NOW_AFTER);
    expect(r.stops.find((x) => x.id === 's1')?.status).toBe('pending');
  });

  it('drops poor-accuracy, duplicate/late and teleport points', () => {
    const stops = engineStops(plannedStops(ROUTE, 'drop'));
    const t = (s: number) => new Date(T0 + s * 1000).toISOString();
    const start: GpsPoint = { lat: 17.4, lng: 78.4, accuracy: 10, recordedAt: t(0) };
    const r = processPoints(stops, initialEngineState(start), [
      { lat: 17.401, lng: 78.4, accuracy: 500, recordedAt: t(10) }, // poor accuracy
      { lat: 17.401, lng: 78.4, accuracy: 10, recordedAt: t(0) }, // not newer than last
      { lat: 18.5, lng: 78.4, accuracy: 10, recordedAt: t(20) }, // 120 km in 20 s
      { lat: 17.401, lng: 78.4, accuracy: 10, recordedAt: t(30) }, // fine
    ], S, NOW_AFTER);
    expect(r.rejected).toBe(3);
    expect(r.accepted).toHaveLength(1);
  });

  it('parked-phone jitter does not add distance', () => {
    const stops = engineStops(plannedStops(ROUTE, 'drop'));
    const t = (s: number) => new Date(T0 + s * 1000).toISOString();
    const jitter: GpsPoint[] = Array.from({ length: 30 }, (_, i) => ({
      lat: 17.405 + (i % 2 ? 0.00004 : -0.00004), // ±4 m
      lng: 78.4,
      accuracy: 10,
      recordedAt: t(i * 5),
    }));
    const r = processPoints(stops, initialEngineState(), jitter, S, NOW_AFTER);
    expect(r.state.distanceM).toBe(0);
    // stayed put the whole time → not-moving window started at the first point
    expect(r.state.anchor?.since).toBe(t(0));
  });
});

describe('eta + presence', () => {
  it('ETA and distance grow along the remaining stops', () => {
    const stops = engineStops(plannedStops(ROUTE, 'drop')).map((x, i) => ({ ...x, status: i === 0 ? ('reached' as const) : ('pending' as const) }));
    const base = new Date(T0);
    const etas = computeEtas(stops, { lat: 17.405, lng: 78.4 }, 30, base, S);
    const list = ['s1', 's2', 's3', 'end'].map((id) => etas.get(id)!);
    expect(list.every(Boolean)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].distanceM).toBeGreaterThan(list[i - 1].distanceM);
      expect(list[i].etaAt.getTime()).toBeGreaterThan(list[i - 1].etaAt.getTime());
    }
    expect(etas.has('school')).toBe(false); // already reached
  });

  it('presence: live → away → offline', () => {
    const now = new Date(T0);
    const ago = (s: number) => new Date(T0 - s * 1000);
    expect(presenceOf(ago(10), true, now, S)).toBe('live');
    expect(presenceOf(ago(90), true, now, S)).toBe('away');
    expect(presenceOf(ago(400), true, now, S)).toBe('offline');
    expect(presenceOf(ago(10), false, now, S)).toBe('not_on_trip');
  });
});
