import type { TrackingSettings } from '../tracking-settings';

export type StationaryAction = 'none' | 'ask_driver' | 'alert_school';

export interface StationaryInput {
  /** How long the bus has stayed inside the not-moving circle (s). */
  stillSec: number;
  /** Bus is within the radius of a trip stop (waiting there is normal — up to a point). */
  atAStop: boolean;
  /** Driver was already asked "everything OK?" in this not-moving window. */
  askedThisWindow: boolean;
  /** School was already alerted in this not-moving window. */
  alertedThisWindow: boolean;
  /** Driver's reply in this window (breakdown / emergency alert the school at reply time). */
  replied: boolean;
  /** Seconds since the driver was asked (0 if not asked). */
  secsSinceAsked: number;
}

/**
 * Not-moving escalation (pure, unit-tested):
 *   4 min still (away from stops)        → ask the driver
 *   no reply 2 min after asking          → alert the school
 *   10 min still — ANYWHERE, any reply   → alert the school (a 10-min stop is never normal)
 */
export function stationaryAction(i: StationaryInput, s: TrackingSettings): StationaryAction {
  if (i.alertedThisWindow) return 'none';
  if (i.stillSec < s.stationaryAlertSec) return 'none';
  const tooLong = i.stillSec >= s.stationaryEscalateSec;
  if (i.atAStop && !tooLong) return 'none';
  if (tooLong) return 'alert_school';
  if (!i.askedThisWindow) return 'ask_driver';
  if (!i.replied && i.secsSinceAsked >= s.checkInTimeoutSec) return 'alert_school';
  return 'none';
}
