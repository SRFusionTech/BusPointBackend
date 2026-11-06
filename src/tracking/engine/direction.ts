import { effectiveDistanceM, type LatLng } from './geo';
import type { TrackingSettings } from '../tracking-settings';

export type TripDirection = 'pickup' | 'drop';
export type StopKind = 'school' | 'stop' | 'end';

export interface RouteStopLike extends LatLng {
  id: string;
  name: string;
  kind: StopKind;
  stopOrder: number;
  address: string | null;
}

/**
 * Routes are stored school → pickup stops → optional "Last Stop" (kind 'end').
 *  - Drop   (evening): school → stops → last stop        (stored order)
 *  - Pickup (morning): last stop → stops → school         (reversed)
 */
export function plannedStops<T extends RouteStopLike>(stops: T[], direction: TripDirection): T[] {
  const asc = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
  return direction === 'drop' ? asc : asc.reverse();
}

/** Where a trip in this direction must start. */
export function routeOrigin<T extends RouteStopLike>(stops: T[], direction: TripDirection): T | null {
  return plannedStops(stops, direction)[0] ?? null;
}

export function originRadiusM(origin: RouteStopLike, s: TrackingSettings): number {
  return origin.kind === 'school' ? Math.max(s.startRadiusM, s.schoolRadiusM) : s.startRadiusM;
}

export interface StartCandidate<T extends RouteStopLike> {
  direction: TripDirection;
  origin: T;
  routeStops: T[];
  distanceM: number;
  radiusM: number;
  inside: boolean;
}

/**
 * Decide the trip direction from where the driver is when tapping Start.
 * Near the school → drop. Near the route's far end → pickup. Both → the nearer one.
 * Returns all candidates so the caller can tell the driver how far they are.
 */
export function detectDirection<T extends RouteStopLike>(
  position: LatLng & { accuracy?: number | null },
  routes: { pickup: T[]; drop: T[] },
  s: TrackingSettings,
): { chosen: StartCandidate<T> | null; candidates: StartCandidate<T>[] } {
  const candidates: StartCandidate<T>[] = [];
  for (const direction of ['pickup', 'drop'] as const) {
    const routeStops = routes[direction];
    const origin = routeOrigin(routeStops, direction);
    if (!origin || routeStops.length < 2) continue;
    const distance = effectiveDistanceM(position, origin, s.accuracyCreditCapM);
    const radius = originRadiusM(origin, s);
    candidates.push({ direction, origin, routeStops, distanceM: distance, radiusM: radius, inside: distance <= radius });
  }
  const inside = candidates.filter((c) => c.inside).sort((a, b) => a.distanceM - b.distanceM);
  return { chosen: inside[0] ?? null, candidates };
}
