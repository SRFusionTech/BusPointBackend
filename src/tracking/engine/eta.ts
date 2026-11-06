import { distanceM, type LatLng } from './geo';
import type { TrackingSettings } from '../tracking-settings';

export interface EtaStop extends LatLng {
  id: string;
  seq: number;
  status: 'pending' | 'reached' | 'skipped';
}

export interface StopEta {
  etaAt: Date;
  /** Road distance from the bus (m). */
  distanceM: number;
}

/**
 * ETA + remaining road distance for every pending stop, from the bus position.
 * distance = bus → next stop, then stop → stop (straight line × road factor).
 * time     = distance ÷ trusted speed + dwell for each stop in between.
 */
export function computeEtas(
  stops: EtaStop[],
  bus: LatLng | null,
  speedKmh: number | null,
  base: Date,
  s: TrackingSettings,
): Map<string, StopEta> {
  const out = new Map<string, StopEta>();
  if (!bus) return out;
  const speed = speedKmh != null && speedKmh >= s.minSpeedKmh ? speedKmh : s.defaultSpeedKmh;
  const pending = [...stops].sort((a, b) => a.seq - b.seq).filter((x) => x.status === 'pending');
  let prev: LatLng = bus;
  let cumM = 0;
  pending.forEach((stop, i) => {
    cumM += distanceM(prev, stop) * s.roadFactor;
    const seconds = (cumM / 1000 / speed) * 3600 + i * s.dwellPerStopSec;
    out.set(stop.id, { etaAt: new Date(base.getTime() + seconds * 1000), distanceM: Math.round(cumM) });
    prev = stop;
  });
  return out;
}
