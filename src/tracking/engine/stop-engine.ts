import { distanceM, effectiveDistanceM, type LatLng } from './geo';
import type { StopKind } from './direction';
import type { TrackingSettings } from '../tracking-settings';

/**
 * The ONE stop engine. Pure: (stops, state, points) → (stops, state, events).
 * The backend is the only place that decides reached / skipped / completed.
 */

export type EngineStopStatus = 'pending' | 'reached' | 'skipped';

export interface EngineStop extends LatLng {
  id: string;
  kind: StopKind;
  seq: number;
  status: EngineStopStatus;
  arrivedAt: string | null;
}

export interface GpsPoint extends LatLng {
  accuracy?: number | null;
  /** m/s as reported by the phone (may be missing / -1). */
  speed?: number | null;
  heading?: number | null;
  recordedAt: string; // ISO
}

export interface EngineState {
  /** Consecutive points inside each candidate stop's circle. */
  insideCount: Record<string, number>;
  /** Last accepted point (time / jump checks). */
  lastPoint: GpsPoint | null;
  /** Reference point for distance (only moves when the bus moves > jitter). */
  distRef: LatLng | null;
  distanceM: number;
  /** Smoothed speed (km/h). */
  speedKmh: number | null;
  /** Centre + start time of the current "not moving" window. */
  anchor: (LatLng & { since: string }) | null;
  /** Stop the bus is currently sitting at (last reached, still inside its circle). */
  atStopId: string | null;
}

export type EngineEvent =
  | { type: 'stop_reached'; stopId: string; at: string }
  | { type: 'stop_skipped'; stopId: string; at: string }
  | { type: 'completed'; at: string };

export interface EngineResult {
  stops: EngineStop[];
  state: EngineState;
  accepted: GpsPoint[];
  rejected: number;
  events: EngineEvent[];
  completedAt: string | null;
}

export function initialEngineState(start?: GpsPoint): EngineState {
  return {
    insideCount: {},
    lastPoint: start ?? null,
    distRef: start ? { lat: start.lat, lng: start.lng } : null,
    distanceM: 0,
    speedKmh: null,
    anchor: start ? { lat: start.lat, lng: start.lng, since: start.recordedAt } : null,
    atStopId: null,
  };
}

export function stopRadiusM(stop: { kind: StopKind }, s: TrackingSettings): number {
  return stop.kind === 'school' ? s.schoolRadiusM : s.stopRadiusM;
}

const FUTURE_TOLERANCE_MS = 2 * 60_000;

export function processPoints(
  inputStops: EngineStop[],
  inputState: EngineState,
  points: GpsPoint[],
  s: TrackingSettings,
  now: Date = new Date(),
): EngineResult {
  const stops = inputStops.map((x) => ({ ...x })).sort((a, b) => a.seq - b.seq);
  const state: EngineState = {
    ...inputState,
    insideCount: { ...inputState.insideCount },
  };
  const accepted: GpsPoint[] = [];
  const events: EngineEvent[] = [];
  let rejected = 0;
  let completedAt: string | null = null;

  const sorted = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  for (const p of sorted) {
    const t = Date.parse(p.recordedAt);
    // ── 1. Reject bad points ───────────────────────────────────────────────
    if (!Number.isFinite(t) || t > now.getTime() + FUTURE_TOLERANCE_MS) { rejected++; continue; }
    if (p.accuracy != null && p.accuracy > s.maxAccuracyM) { rejected++; continue; }
    const last = state.lastPoint;
    if (last) {
      const dt = (t - Date.parse(last.recordedAt)) / 1000;
      if (dt <= 0) { rejected++; continue; } // late / duplicate point — never moves the bus backwards
      const kmh = (distanceM(last, p) / dt) * 3.6;
      if (kmh > s.maxJumpKmh) { rejected++; continue; }
    }
    accepted.push(p);

    // ── 2. Distance (ignore parked-phone jitter) + speed ───────────────────
    if (!state.distRef) state.distRef = { lat: p.lat, lng: p.lng };
    const moved = distanceM(state.distRef, p);
    if (moved >= s.jitterM) {
      state.distanceM += moved;
      state.distRef = { lat: p.lat, lng: p.lng };
    }
    let v: number | null = null;
    if (p.speed != null && p.speed >= 0) v = p.speed * 3.6;
    else if (last) {
      const dt = (t - Date.parse(last.recordedAt)) / 1000;
      if (dt > 0) v = (distanceM(last, p) / dt) * 3.6;
    }
    if (v != null) state.speedKmh = state.speedKmh == null ? v : state.speedKmh * 0.7 + v * 0.3;

    // ── 3. Not-moving window ───────────────────────────────────────────────
    if (!state.anchor || distanceM(state.anchor, p) > s.stationaryRadiusM) {
      state.anchor = { lat: p.lat, lng: p.lng, since: p.recordedAt };
    }

    state.lastPoint = p;

    // ── 4. Stops: next pending + lookahead ─────────────────────────────────
    if (completedAt) continue;
    const nextIdx = stops.findIndex((x) => x.status === 'pending');
    if (nextIdx === -1) continue;
    const candidates = stops.slice(nextIdx, nextIdx + 1 + s.skipLookahead).filter((x) => x.status === 'pending');
    for (const c of candidates) {
      const inside = effectiveDistanceM(p, c, s.accuracyCreditCapM) <= stopRadiusM(c, s);
      state.insideCount[c.id] = inside ? (state.insideCount[c.id] ?? 0) + 1 : 0;
    }
    const hit = candidates.find((c) => (state.insideCount[c.id] ?? 0) >= s.consecutiveInside);
    if (hit) {
      for (const x of stops) {
        if (x.status === 'pending' && x.seq < hit.seq) {
          x.status = 'skipped';
          events.push({ type: 'stop_skipped', stopId: x.id, at: p.recordedAt });
        }
      }
      hit.status = 'reached';
      hit.arrivedAt = p.recordedAt;
      events.push({ type: 'stop_reached', stopId: hit.id, at: p.recordedAt });
      state.insideCount = {};
      if (stops.every((x) => x.status !== 'pending')) {
        completedAt = p.recordedAt;
        events.push({ type: 'completed', at: p.recordedAt });
      }
    }
  }

  // ── 5. Which stop is the bus sitting at right now? ───────────────────────
  const lastPoint = state.lastPoint;
  const lastReached = [...stops].reverse().find((x) => x.status === 'reached');
  state.atStopId =
    lastPoint && lastReached && effectiveDistanceM(lastPoint, lastReached, s.accuracyCreditCapM) <= stopRadiusM(lastReached, s)
      ? lastReached.id
      : null;

  return { stops, state, accepted, rejected, events, completedAt };
}
