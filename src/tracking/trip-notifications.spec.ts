import { approachNotices, noticesForEvent, NotifyStop, NotifyTrip } from './trip-notifications';

const now = new Date('2026-11-18T08:00:00Z');
const trip = (over: Partial<NotifyTrip> = {}): NotifyTrip => ({ id: 'T1', routeName: 'Route 7', direction: 'pickup', status: 'in_progress', ...over });

function stops(statuses: NotifyStop['status'][], notified: number[] = []): NotifyStop[] {
  return statuses.map((status, seq) => ({
    id: `s${seq}`,
    routeStopId: seq === statuses.length - 1 ? null : `rs${seq}`, // last = school, no parents
    seq,
    name: `Stop ${seq}`,
    status,
    etaAt: status === 'pending' ? new Date(now.getTime() + seq * 3 * 60_000) : null,
    approachNotified: notified.includes(seq),
  }));
}

const audienceOf = (n: { audience: unknown }) => (n.audience as { routeStopIds: string[] }).routeStopIds;

describe('noticesForEvent', () => {
  it('started: next two stops get a personal heads-up, later stops a generic one, seq 0 nothing', () => {
    const s = stops(['reached', 'pending', 'pending', 'pending', 'pending']);
    const out = noticesForEvent({ type: 'started', at: now, payload: {} }, trip(), s, now);
    expect(out.coveredApproach).toEqual(['s1', 's2']);
    expect(out.notices.map(audienceOf)).toEqual([['rs1'], ['rs2'], ['rs3']]);
    expect(out.notices[0].message.body).toContain('Stop 1 is the next stop');
    expect(out.notices.every((n) => n.message.channel === 'trip-updates' && n.message.type === 'trip_started')).toBe(true);
    expect(out.notices[0].message.data).toEqual({ tripId: 'T1' });
  });

  it('stop_reached: only that stop, wording by direction', () => {
    const s = stops(['reached', 'reached', 'pending', 'pending']);
    const pick = noticesForEvent({ type: 'stop_reached', at: now, payload: { stopId: 's1' } }, trip(), s, now);
    expect(pick.notices).toHaveLength(1);
    expect(audienceOf(pick.notices[0])).toEqual(['rs1']);
    expect(pick.notices[0].message.title).toBe('Bus is at your stop');
    const drop = noticesForEvent({ type: 'stop_reached', at: now, payload: { stopId: 's1' } }, trip({ direction: 'drop' }), s, now);
    expect(drop.notices[0].message.title).toBe('Bus has reached your stop');
  });

  it('stop_skipped: passed (engine) vs trip ended early, both safety alerts', () => {
    const s = stops(['reached', 'skipped', 'pending', 'pending']);
    const passed = noticesForEvent({ type: 'stop_skipped', at: now, payload: { stopId: 's1' } }, trip(), s, now);
    expect(passed.notices[0].message).toMatchObject({ type: 'stop_passed', channel: 'safety-alerts' });
    const early = noticesForEvent({ type: 'stop_skipped', at: now, payload: { stopId: 's2', reason: 'manual' } }, trip(), s, now);
    expect(early.notices[0].message).toMatchObject({ type: 'trip_ended_early', channel: 'safety-alerts' });
  });

  it('ended: pickup tells the children on board; drop and auto-timeout say nothing', () => {
    const s = stops(['reached', 'reached', 'skipped', 'reached']);
    const school = noticesForEvent({ type: 'ended', at: now, payload: { reason: 'last_stop' } }, trip({ status: 'completed' }), s, now);
    expect(school.notices[0].message.type).toBe('arrived_school');
    expect(audienceOf(school.notices[0])).toEqual(['rs0', 'rs1']);
    expect(noticesForEvent({ type: 'ended', at: now, payload: { reason: 'last_stop' } }, trip({ direction: 'drop' }), s, now).notices).toEqual([]);
    expect(noticesForEvent({ type: 'ended', at: now, payload: { reason: 'auto_timeout' } }, trip(), s, now).notices).toEqual([]);
  });

  it('breakdown alerts parents; SOS, emergency, traffic and GPS events never reach parents', () => {
    const s = stops(['reached', 'reached', 'pending', 'pending']);
    const pick = noticesForEvent({ type: 'check_in', at: now, payload: { response: 'breakdown' } }, trip(), s, now);
    expect(pick.notices[0].message).toMatchObject({ type: 'bus_delayed', channel: 'safety-alerts' });
    expect(audienceOf(pick.notices[0])).toEqual(['rs0', 'rs1', 'rs2']);
    const drop = noticesForEvent({ type: 'check_in', at: now, payload: { response: 'breakdown' } }, trip({ direction: 'drop' }), s, now);
    expect(audienceOf(drop.notices[0])).toEqual(['rs2']);
    for (const ev of [
      { type: 'sos' as const, payload: {} },
      { type: 'check_in' as const, payload: { response: 'emergency' } },
      { type: 'check_in' as const, payload: { response: 'traffic' } },
      { type: 'stationary' as const, payload: {} },
      { type: 'gps_lost' as const, payload: {} },
    ]) {
      expect(noticesForEvent({ ...ev, at: now }, trip(), s, now).notices).toEqual([]);
    }
  });

  it('check_in_requested goes to the driver', () => {
    const out = noticesForEvent({ type: 'check_in_requested', at: now, payload: { minutes: 6 } }, trip(), stops(['reached', 'pending']), now);
    expect(out.notices[0].audience).toEqual({ driver: true });
    expect(out.notices[0].message.body).toContain('6 min');
  });
});

describe('approachNotices', () => {
  it('notifies the next two pending stops once each, wording by position', () => {
    const s = stops(['reached', 'reached', 'pending', 'pending', 'pending'], [2]);
    const due = approachNotices(trip(), s, now);
    expect(due.map((d) => d.stopId)).toEqual(['s3']);
    expect(due[0].notice!.message.title).toBe('Bus is 2 stops away');
  });

  it('a skipped stop does not make the next one miss its push', () => {
    // s1 reached, s2 skipped → window is s3, s4; s3 was 2-stops-away earlier, s4 is new.
    const s = stops(['reached', 'reached', 'skipped', 'pending', 'pending', 'pending'], [3]);
    expect(approachNotices(trip(), s, now).map((d) => d.stopId)).toEqual(['s4']);
  });

  it('marks stops without parents (school) but sends nothing, and stops when the trip ends', () => {
    const s = stops(['reached', 'reached', 'reached', 'pending'], []);
    expect(approachNotices(trip(), s, now)).toEqual([{ stopId: 's3', notice: null }]);
    expect(approachNotices(trip({ status: 'completed' }), stops(['reached', 'pending', 'pending']), now)).toEqual([]);
  });
});
