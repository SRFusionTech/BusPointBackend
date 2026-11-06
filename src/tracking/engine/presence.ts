import type { TrackingSettings } from '../tracking-settings';

export type Presence = 'live' | 'away' | 'offline' | 'not_on_trip';

/** Freshness of the bus location — based on the last point the SERVER received. */
export function presenceOf(lastPingAt: Date | null, onTrip: boolean, now: Date, s: TrackingSettings): Presence {
  if (!onTrip) return 'not_on_trip';
  if (!lastPingAt) return 'offline';
  const ageSec = (now.getTime() - lastPingAt.getTime()) / 1000;
  if (ageSec <= s.liveWithinSec) return 'live';
  if (ageSec < s.offlineAfterSec) return 'away';
  return 'offline';
}
