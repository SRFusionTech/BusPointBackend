const KNOWN_MOCK_POINTS: Array<{ lat: number; lng: number }> = [
  { lat: 37.4220936, lng: -122.0840647 },
  { lat: 37.422, lng: -122.084 },
  { lat: 37.33233141, lng: -122.0312186 },
  { lat: 37.7749, lng: -122.4194 },
];

const MOCK_RADIUS_M = 300;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isKnownMockCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return true;
  return KNOWN_MOCK_POINTS.some((p) => haversineMeters(p, { lat, lng }) <= MOCK_RADIUS_M);
}

export function isUsableDriverCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !isKnownMockCoordinate(lat, lng);
}
