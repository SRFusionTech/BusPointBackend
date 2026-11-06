import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACKING_SETTINGS as S } from '../tracking-settings';
import { stationaryAction, type StationaryInput } from './stationary';

const base: StationaryInput = { stillSec: 0, atAStop: false, askedThisWindow: false, alertedThisWindow: false, replied: false, secsSinceAsked: 0 };
const min = (m: number) => m * 60;

describe('not-moving escalation', () => {
  it('does nothing before 4 min', () => {
    expect(stationaryAction({ ...base, stillSec: min(3) }, S)).toBe('none');
  });

  it('asks the driver first at 4 min', () => {
    expect(stationaryAction({ ...base, stillSec: min(4) }, S)).toBe('ask_driver');
  });

  it('alerts the school 2 min after asking with no reply', () => {
    const asked = { ...base, stillSec: min(6), askedThisWindow: true };
    expect(stationaryAction({ ...asked, secsSinceAsked: min(1) }, S)).toBe('none');
    expect(stationaryAction({ ...asked, secsSinceAsked: min(2) }, S)).toBe('alert_school');
  });

  it('a reply (e.g. traffic) holds off the alert — until 10 min', () => {
    const replied = { ...base, askedThisWindow: true, replied: true, secsSinceAsked: min(5) };
    expect(stationaryAction({ ...replied, stillSec: min(9) }, S)).toBe('none');
    expect(stationaryAction({ ...replied, stillSec: min(10) }, S)).toBe('alert_school');
  });

  it('waiting at a stop is normal — but not for 10 min', () => {
    expect(stationaryAction({ ...base, atAStop: true, stillSec: min(6) }, S)).toBe('none');
    expect(stationaryAction({ ...base, atAStop: true, stillSec: min(10) }, S)).toBe('alert_school');
  });

  it('alerts only once per not-moving window', () => {
    expect(stationaryAction({ ...base, stillSec: min(15), alertedThisWindow: true }, S)).toBe('none');
  });
});
