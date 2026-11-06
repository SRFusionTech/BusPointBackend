export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing a → b, 0–360°. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Distance used for "is the bus inside this circle": the point's GPS accuracy is credited
 * (it could be that much closer), capped so a very poor fix can't count as inside.
 */
export function effectiveDistanceM(point: LatLng & { accuracy?: number | null }, target: LatLng, accuracyCapM: number): number {
  const credit = Math.min(Math.max(point.accuracy ?? 0, 0), accuracyCapM);
  return Math.max(0, distanceM(point, target) - credit);
}
