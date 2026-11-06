import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LatLng } from './engine/geo';
import { decodePolyline, encodePolyline } from './engine/polyline';

const GOOGLE_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
/** Free OSRM server (OpenStreetMap roads). Fair-use: low volume only — fine because we fetch once per route + direction. */
const OSRM_DEFAULT = 'https://router.project-osrm.org';
/** Routes API: max 25 intermediate waypoints per request. */
const MAX_INTERMEDIATES = 25;
const CACHE_MAX = 500;

/**
 * Road-following path between consecutive stops.
 *  1. OSRM (free, OpenStreetMap) — always tried first.
 *  2. Google Routes API (paid) — only if OSRM fails AND GOOGLE_MAPS_SERVER_KEY is set.
 * Called once per trip start; results cached in memory by the exact stop sequence, so the same
 * route + direction is fetched only once per server run. Parents/admins viewing never trigger a call.
 */
@Injectable()
export class RoadRoutesService {
  private readonly logger = new Logger(RoadRoutesService.name);
  private readonly apiKey: string | undefined;
  private readonly osrmUrl: string;
  private readonly cache = new Map<string, string[]>();

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_MAPS_SERVER_KEY') || undefined;
    this.osrmUrl = (config.get<string>('OSRM_URL') || OSRM_DEFAULT).replace(/\/$/, '');
  }

  /** Encoded polyline per leg (stops[i] → stops[i+1]), or null if unavailable. */
  async legs(stops: LatLng[]): Promise<string[] | null> {
    if (stops.length < 2) return null;
    const key = stops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join(';');
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      // Long routes: chunks of origin + 25 + destination, each starting where the last ended.
      const chunks: LatLng[][] = [];
      for (let i = 0; i < stops.length - 1; i += MAX_INTERMEDIATES + 1) {
        chunks.push(stops.slice(i, i + MAX_INTERMEDIATES + 2));
      }
      const legs = await this.osrmLegs(stops).catch(async (err) => {
        if (!this.apiKey) throw err;
        this.logger.warn(`OSRM failed (${(err as Error).message}); trying Google Routes`);
        const parts = await Promise.all(chunks.map((c) => this.fetchLegs(c)));
        return parts.flat();
      });
      if (legs.length !== stops.length - 1) throw new Error(`expected ${stops.length - 1} legs, got ${legs.length}`);

      if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, legs);
      return legs;
    } catch (err) {
      this.logger.warn(`Road path lookup failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** One OSRM request; each leg's road path = its steps' geometries joined. */
  private async osrmLegs(points: LatLng[]): Promise<string[]> {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${this.osrmUrl}/route/v1/driving/${coords}?overview=false&steps=true&geometries=polyline`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'BusPoint-Backend/1.0' },
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const body = (await res.json()) as { code?: string; routes?: { legs?: { steps?: { geometry?: string }[] }[] }[] };
    if (body.code !== 'Ok') throw new Error(`OSRM ${body.code}`);
    return (body.routes?.[0]?.legs ?? []).map((leg) => {
      const pts = (leg.steps ?? []).flatMap((st, i) => {
        const p = decodePolyline(st.geometry ?? '');
        return i === 0 ? p : p.slice(1);
      });
      if (pts.length < 2) throw new Error('OSRM leg without geometry');
      return encodePolyline(pts);
    });
  }

  private async fetchLegs(points: LatLng[]): Promise<string[]> {
    const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const res = await fetch(GOOGLE_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey!,
        'X-Goog-FieldMask': 'routes.legs.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: waypoint(points[0]),
        destination: waypoint(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(waypoint),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        polylineQuality: 'HIGH_QUALITY',
      }),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { routes?: { legs?: { polyline?: { encodedPolyline?: string } }[] }[] };
    const legs = body.routes?.[0]?.legs ?? [];
    return legs.map((l) => {
      const enc = l.polyline?.encodedPolyline;
      if (!enc) throw new Error('leg without polyline');
      return enc;
    });
  }
}
