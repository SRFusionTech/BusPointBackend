import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from './polyline';
import { decodeLegs, roadDistances, roadView, truncateAhead, type RoadStop } from './road';

// Three stops on an L-shaped road: A(0,0) → B(0,0.01) → C(0.01,0.01). Each leg ≈ 1.11 km.
const A = { lat: 17.0, lng: 78.0 };
const corner = { lat: 17.0, lng: 78.005 };
const B = { lat: 17.0, lng: 78.01 };
const C = { lat: 17.01, lng: 78.01 };
const legs = [encodePolyline([A, corner, B]), encodePolyline([B, C])];

const stops = (statuses: RoadStop['status'][]): RoadStop[] =>
  [A, B, C].map((p, seq) => ({ ...p, id: `s${seq}`, seq, status: statuses[seq] }));

describe('polyline', () => {
  it('round-trips', () => {
    const pts = [A, B, C, { lat: -33.86882, lng: 151.20929 }];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });
});

describe('road engine', () => {
  const paths = decodeLegs(legs, 3)!;

  it('rejects legs that do not match the stops', () => {
    expect(decodeLegs(legs, 4)).toBeNull();
    expect(decodeLegs(null, 3)).toBeNull();
  });

  it('measures road distance from the bus along the current leg and beyond', () => {
    const bus = { lat: 17.0001, lng: 78.0025 }; // ~11 m off the road, a quarter into leg A→B
    const d = roadDistances(paths, stops(['reached', 'pending', 'pending']), bus, 1.3)!;
    expect(d.get('s1')!).toBeGreaterThan(780);
    expect(d.get('s1')!).toBeLessThan(840);
    expect(d.get('s2')! - d.get('s1')!).toBeCloseTo(1112, -1);
    expect(d.has('s0')).toBe(false);
  });

  it('splits passed / ahead at the bus and truncates for parents', () => {
    const bus = { lat: 17.0, lng: 78.0025 };
    const v = roadView(paths, stops(['reached', 'pending', 'pending']), bus)!;
    expect(decodePolyline(v.passed!)).toEqual([A, bus]);
    expect(decodePolyline(v.ahead!)).toEqual([bus, corner, B, C]);
    expect(decodePolyline(truncateAhead(v, 1)!)).toEqual([bus, corner, B]);
  });

  it('marks the whole road passed once nothing is pending', () => {
    const v = roadView(paths, stops(['reached', 'reached', 'reached']), null)!;
    expect(v.ahead).toBeNull();
    expect(decodePolyline(v.passed!)).toEqual([A, corner, B, C]);
  });
});
