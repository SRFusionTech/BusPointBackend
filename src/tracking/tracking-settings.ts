/**
 * Tracking tunables. Stored per school under `schools.settings.tracking` (partial);
 * anything missing falls back to these defaults. No UI yet — edit the JSON to tune.
 */
export interface TrackingSettings {
  /** Driver can start a trip only inside this circle around the route's start point (m). */
  startRadiusM: number;
  /** Bus inside this circle of a stop = stop reached (m). */
  stopRadiusM: number;
  /** Larger circle for the school (campus / gate far from the pin) (m). */
  schoolRadiusM: number;
  /** A point's GPS accuracy is credited up to this much when checking a circle (m). */
  accuracyCreditCapM: number;
  /** Points with worse accuracy are ignored (m). */
  maxAccuracyM: number;
  /** Implied speed above this between two points = GPS jump, ignored (km/h). */
  maxJumpKmh: number;
  /** Moves smaller than this don't add to distance covered (parked-phone jitter) (m). */
  jitterM: number;
  /** Consecutive points inside a stop circle needed to mark it reached. */
  consecutiveInside: number;
  /** How many stops beyond the next pending one are checked (for skip detection). */
  skipLookahead: number;
  /** Time added per intermediate stop when estimating ETA (s). */
  dwellPerStopSec: number;
  /** Speed used for ETA when the bus is slow/stopped or speed is unknown (km/h). */
  defaultSpeedKmh: number;
  /** Below this the measured speed is not trusted for ETA (km/h). */
  minSpeedKmh: number;
  /** Straight-line → road distance multiplier for ETA/distance. */
  roadFactor: number;
  /** Last point newer than this = "live" (s). */
  liveWithinSec: number;
  /** No point for this long = "offline" + GPS-lost alert (s). */
  offlineAfterSec: number;
  /** Bus staying inside this circle counts as not moving (m). */
  stationaryRadiusM: number;
  /** Not moving (away from any stop) for this long → driver is asked "Everything OK?" (s). */
  stationaryAlertSec: number;
  /** No reply to the check-in within this time → school is alerted (s). */
  checkInTimeoutSec: number;
  /** Not moving this long → school is alerted no matter what the driver replied (s). */
  stationaryEscalateSec: number;
  /** No point for this long = trip auto-closed (s). */
  autoTimeoutSec: number;
}

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  startRadiusM: 150,
  stopRadiusM: 100,
  schoolRadiusM: 200,
  accuracyCreditCapM: 50,
  maxAccuracyM: 100,
  maxJumpKmh: 150,
  jitterM: 10,
  consecutiveInside: 2,
  skipLookahead: 2,
  dwellPerStopSec: 60,
  defaultSpeedKmh: 20,
  minSpeedKmh: 8,
  roadFactor: 1.3,
  liveWithinSec: 30,
  offlineAfterSec: 180,
  stationaryRadiusM: 50,
  stationaryAlertSec: 240,
  checkInTimeoutSec: 120,
  stationaryEscalateSec: 600,
  autoTimeoutSec: 7200,
};

export function resolveTrackingSettings(schoolSettings: unknown): TrackingSettings {
  const stored = (schoolSettings as { tracking?: Partial<TrackingSettings> } | null | undefined)?.tracking ?? {};
  const merged = { ...DEFAULT_TRACKING_SETTINGS };
  for (const key of Object.keys(DEFAULT_TRACKING_SETTINGS) as (keyof TrackingSettings)[]) {
    const v = stored[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) merged[key] = v;
  }
  return merged;
}
