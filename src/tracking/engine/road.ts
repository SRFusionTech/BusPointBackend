import { distanceM, type LatLng } from './geo';
import { decodePolyline, encodePolyline } from './polyline';

/**
 * Road geometry of a trip. `legs[i]` = encoded road path from stop seq i to stop seq i+1
 * (from Google Routes, fetched once at trip start). Everything here is pure + cheap.
 */

export interface RoadStop extends LatLng {
  id: string;
  seq: number;
  status: 'pending' | 'reached' | 'skipped';
}

export interface RoadView {
  /** Start → bus (encoded). Null before the trip has moved. */
  passed: string | null;
  /** Bus → last stop (encoded). Null once there is nothing ahead. */
  ahead: string | null;
  /** For each stop still ahead: index in the decoded `ahead` path where that stop is. */
  aheadStops: { seq: number; index: number }[];
}

interface BusOnRoad {
  /** Leg the bus is on (= seq of the stop it last left). */
  leg: number;
  /** Segment of that leg (points[seg] → points[seg+1]) the bus is projected onto. */
  seg: number;
  point: LatLng;
  /** Straight-line distance from the real bus position to the road (m). */
  offM: number;
}

/** Decoded legs, or null if they don't match the stop list (route changed / fetch failed). */
export function decodeLegs(legs: string[] | null | undefined, stopCount: number): LatLng[][] | null {
  if (!legs || legs.length !== stopCount - 1) return null;
  const paths = legs.map(decodePolyline);
  return paths.every((p) => p.length >= 2) ? paths : null;
}

function pathLength(path: LatLng[], from = 0): number {
  let m = 0;
  for (let i = from; i < path.length - 1; i++) m += distanceM(path[i], path[i + 1]);
  return m;
}

/** Closest point on segment a→b to p (flat-earth approximation, fine at city scale). */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { lat: ay + t * dy, lng: (ax + t * dx) / k };
}

function sortedStops(stops: RoadStop[]): RoadStop[] {
  return [...stops].sort((a, b) => a.seq - b.seq);
}

/** Where the bus is along the road: on the leg leading to the first pending stop. */
function locateBus(paths: LatLng[][], stops: RoadStop[], bus: LatLng | null): BusOnRoad | null {
  const firstPending = stops.find((s) => s.status === 'pending');
  if (!firstPending) return null;
  const leg = Math.max(0, firstPending.seq - 1);
  const path = paths[leg];
  if (!bus) return { leg, seg: 0, point: path[0], offM: 0 };

  let best: BusOnRoad = { leg, seg: 0, point: path[0], offM: Infinity };
  for (let i = 0; i < path.length - 1; i++) {
    const q = projectOnSegment(bus, path[i], path[i + 1]);
    const d = distanceM(bus, q);
    if (d < best.offM) best = { leg, seg: i, point: q, offM: d };
  }
  return best;
}

/**
 * Road distance from the bus to every pending stop (m), or null when there's no road data.
 * If the bus is off the planned road (detour), the gap back to the road is straight line × roadFactor.
 */
export function roadDistances(paths: LatLng[][] | null, rawStops: RoadStop[], bus: LatLng | null, roadFactor: number): Map<string, number> | null {
  if (!paths || !bus) return null;
  const stops = sortedStops(rawStops);
  const at = locateBus(paths, stops, bus);
  if (!at) return null;

  const out = new Map<string, number>();
  const path = paths[at.leg];
  // Bus → road, then along the rest of the current leg.
  let cum = at.offM * roadFactor + distanceM(at.point, path[at.seg + 1]) + pathLength(path, at.seg + 1);
  for (const s of stops) {
    if (s.seq <= at.leg) continue;
    if (s.seq > at.leg + 1) cum += pathLength(paths[s.seq - 1]);
    if (s.status === 'pending') out.set(s.id, cum);
  }
  return out;
}

/** Passed / ahead road lines, split where the bus is. */
export function roadView(paths: LatLng[][] | null, rawStops: RoadStop[], bus: LatLng | null): RoadView | null {
  if (!paths) return null;
  const stops = sortedStops(rawStops);
  const at = locateBus(paths, stops, bus);

  // Nothing pending (trip done): whole route is "passed".
  if (!at) {
    const all = paths.flatMap((p, i) => (i === 0 ? p : p.slice(1)));
    return { passed: encodePolyline(all), ahead: null, aheadStops: [] };
  }

  const passedPts = [
    ...paths.slice(0, at.leg).flatMap((p, i) => (i === 0 ? p : p.slice(1))),
    ...paths[at.leg].slice(at.leg === 0 ? 0 : 1, at.seg + 1),
    at.point,
  ];
  const aheadPts = [at.point, ...paths[at.leg].slice(at.seg + 1)];
  const aheadStops = [{ seq: at.leg + 1, index: aheadPts.length - 1 }];
  for (let leg = at.leg + 1; leg < paths.length; leg++) {
    aheadPts.push(...paths[leg].slice(1));
    aheadStops.push({ seq: leg + 1, index: aheadPts.length - 1 });
  }

  return {
    passed: passedPts.length >= 2 ? encodePolyline(passedPts) : null,
    ahead: aheadPts.length >= 2 ? encodePolyline(aheadPts) : null,
    aheadStops,
  };
}

/** `ahead` cut off at stop `seq` (parent view: no line beyond what the parent may see). */
export function truncateAhead(view: RoadView, seq: number): string | null {
  if (!view.ahead) return null;
  const cut = view.aheadStops.find((s) => s.seq === seq);
  if (!cut) return null;
  const pts = decodePolyline(view.ahead).slice(0, cut.index + 1);
  return pts.length >= 2 ? encodePolyline(pts) : null;
}
