#!/usr/bin/env node
/**
 * Drive simulator — test live tracking without driving a bus.
 *
 *   node scripts/simulate-drive.mjs --phone 9876543210 --password secret [options]
 *
 * Logs in as the DRIVER, starts a trip at the route's start point (direction is detected by the
 * server from that position), then drives through every stop, posting GPS batches like the app.
 *
 * Options
 *   --api <url>           API base (default http://localhost:8000)
 *   --direction pickup|drop   which start point to use (default: first available)
 *   --speed <km/h>        driving speed (default 40, max 140 — faster looks like a GPS jump)
 *   --interval <s>        seconds between GPS points (default 3)
 *   --batch <n>           points per upload (default 2)
 *   --stall <min>         after the 2nd stop, park away from stops for N minutes
 *                         (→ driver asked "everything OK?" at 4 min; school alerted at 6 min if no reply, or 10 min anyway)
 *   --reply <answer>      during --stall, answer the check-in: traffic | waiting_student | breakdown | emergency
 *   --sos                 press SOS after the 1st stop
 *   --gap <min>           after the 2nd stop, send nothing for N minutes (→ "GPS lost" at 3 min)
 *   --restart             if a trip is already running, end it first
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]);
    return acc;
  }, []),
);
const API = (args.api ?? 'http://localhost:8000').replace(/\/$/, '') + '/api';
const SPEED_KMH = Math.min(140, Number(args.speed ?? 40));
const INTERVAL_S = Number(args.interval ?? 3);
const BATCH = Number(args.batch ?? 2);
const STALL_MIN = Number(args.stall ?? 0);
const GAP_MIN = Number(args.gap ?? 0);

if (!args.phone || !args.password) {
  console.error('Usage: node scripts/simulate-drive.mjs --phone <driver phone> --password <password> [--direction pickup|drop]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const jitter = (p, m = 4) => ({ lat: p.lat + ((Math.random() - 0.5) * 2 * m) / 111000, lng: p.lng + ((Math.random() - 0.5) * 2 * m) / 111000 });
const fmtM = (m) => (m == null ? '—' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const fmtT = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '—');

let token;
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.message ?? res.statusText}`);
  return json.data;
}

function report(trip) {
  const next = trip.stops.find((s) => s.id === trip.nextStopId);
  const p = trip.progress;
  const a = trip.alerts;
  const alerts = [
    a.sos && `SOS${a.sos.acknowledgedAt ? ' (seen)' : ''}`,
    a.gpsLost && 'GPS LOST',
    a.checkIn && !a.checkIn.response && 'ASKED DRIVER',
    a.checkIn?.response && `REPLIED ${a.checkIn.response}`,
    a.stationary && `SCHOOL ALERTED: NOT MOVING ${a.stationary.minutes}m`,
  ].filter(Boolean).join(', ');
  console.log(
    `  [${trip.presence}] ${p.reached}✓ ${p.skipped}✗ ${p.pending}… | ` +
      (next ? `next: ${next.name} in ${fmtM(next.distanceM)} ETA ${fmtT(next.etaAt)}` : `status: ${trip.status}`) +
      ` | ${fmtM(trip.distanceM)} driven` +
      (alerts ? ` | ⚠ ${alerts}` : ''),
  );
}

async function main() {
  const login = await call('POST', '/auth/mobile/login', { phone: args.phone, password: args.password });
  token = login.accessToken;
  console.log(`Logged in as ${login.role}`);

  let home = await call('GET', '/trips/active');
  if (home.problem && !home.trip) throw new Error(home.problem);
  console.log(`Bus: ${home.bus.name} (${home.bus.plateNumber})`);

  if (home.trip && args.restart) {
    await call('POST', `/trips/${home.trip.id}/end`);
    console.log('Ended running trip.');
    home = await call('GET', '/trips/active');
  }

  let trip = home.trip;
  if (!trip) {
    const opt = home.startOptions.find((o) => !args.direction || o.direction === args.direction) ?? home.startOptions[0];
    if (!opt) throw new Error('No start options for this bus.');
    console.log(`Starting ${opt.direction} at "${opt.startAt.name}" → "${opt.endAt.name}" (${opt.stopCount} stops)`);
    trip = await call('POST', '/trips/start', { lat: opt.startAt.lat, lng: opt.startAt.lng, accuracy: 8 });
  } else {
    console.log(`Continuing running trip ${trip.id} (${trip.direction})`);
  }
  console.log(`Trip ${trip.id} — ${trip.direction}: ${trip.stops.map((s) => s.name).join(' → ')}`);
  report(trip);

  // Build the drive: from the bus position through every pending stop, pausing ~3 points at each stop.
  const stepM = (SPEED_KMH / 3.6) * INTERVAL_S;
  let pos = trip.live ? { lat: trip.live.lat, lng: trip.live.lng } : { lat: trip.stops[0].lat, lng: trip.stops[0].lng };
  const pending = trip.stops.filter((s) => s.status === 'pending');
  let queue = [];
  let legIndex = 0;

  const flush = async () => {
    if (!queue.length) return;
    trip = await call('POST', `/trips/${trip.id}/locations`, { points: queue });
    queue = [];
    report(trip);
  };
  const emit = async (p, speedMps) => {
    const j = jitter(p);
    queue.push({ lat: j.lat, lng: j.lng, accuracy: 8 + Math.random() * 6, speed: speedMps, recordedAt: new Date().toISOString() });
    if (queue.length >= BATCH) await flush();
    await sleep(INTERVAL_S * 1000);
  };

  for (const stop of pending) {
    if (trip.status !== 'in_progress') break;
    const d = dist(pos, stop);
    const steps = Math.max(1, Math.ceil(d / stepM));
    for (let k = 1; k <= steps && trip.status === 'in_progress'; k++) {
      const f = k / steps;
      await emit({ lat: pos.lat + (stop.lat - pos.lat) * f, lng: pos.lng + (stop.lng - pos.lng) * f }, SPEED_KMH / 3.6);
    }
    pos = { lat: stop.lat, lng: stop.lng };
    console.log(`  … at ${stop.name}`);
    for (let k = 0; k < 3 && trip.status === 'in_progress'; k++) await emit(pos, 0);
    await flush();
    legIndex++;

    if (legIndex === 1 && args.sos && trip.status === 'in_progress') {
      trip = await call('POST', `/trips/${trip.id}/sos`, { note: 'Simulator SOS' });
      console.log('  🆘 SOS sent');
      report(trip);
    }

    if (legIndex === 2 && trip.status === 'in_progress') {
      if (STALL_MIN > 0) {
        // Park ~400 m off the route so it isn't "waiting at a stop".
        const park = { lat: pos.lat + 0.0036, lng: pos.lng };
        console.log(`  ⏸ parking for ${STALL_MIN} min (expect NOT MOVING alert after 4 min)…`);
        const until = Date.now() + STALL_MIN * 60_000;
        while (Date.now() < until) {
          await emit(park, 0);
          if (args.reply && trip.alerts.checkIn && !trip.alerts.checkIn.response) {
            trip = await call('POST', `/trips/${trip.id}/check-in`, { response: args.reply });
            console.log(`  💬 replied "${args.reply}" to the check-in`);
          }
        }
        await flush();
      }
      if (GAP_MIN > 0) {
        console.log(`  📵 no GPS for ${GAP_MIN} min (expect GPS LOST after 3 min)…`);
        await sleep(GAP_MIN * 60_000);
        trip = await call('GET', '/trips/active').then((h) => h.trip ?? trip);
        report(trip);
      }
    }
  }
  await flush();
  console.log(`Done. Trip status: ${trip.status}${trip.endReason ? ` (${trip.endReason})` : ''}, ${fmtM(trip.distanceM)} in ${Math.round(trip.durationSec / 60)} min.`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
