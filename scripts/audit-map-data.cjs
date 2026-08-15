/**
 * Audit map-readiness data in Postgres (schools, buses, parents, drivers).
 * Usage (from BusPointBackend): node scripts/audit-map-data.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}

function databaseUrl() {
  return process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || null;
}

async function main() {
  loadEnv();
  const url = databaseUrl();
  if (!url) {
    console.error('FAIL: No DATABASE_URL / SUPABASE_DATABASE_URL in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl:
      url.includes('supabase') || url.includes('amazonaws')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  await client.connect();
  const issues = [];

  const schools = await client.query(
    `SELECT id, name, lat, lng FROM schools ORDER BY "createdAt" DESC NULLS LAST LIMIT 20`,
  );
  console.log(`\nSchools: ${schools.rowCount}`);
  for (const s of schools.rows) {
    const ok = Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng));
    console.log(`  - ${s.name}: coords=${ok ? 'OK' : 'MISSING'} (${s.lat}, ${s.lng})`);
    if (!ok) issues.push(`School "${s.name}" missing lat/lng`);
  }

  const buses = await client.query(
    `SELECT id, "plateNumber", "routeName", "routeId", "returnRouteId", status, "lastLat", "lastLng"
     FROM buses ORDER BY "createdAt" DESC NULLS LAST LIMIT 30`,
  );
  console.log(`\nBuses: ${buses.rowCount}`);
  for (const b of buses.rows) {
    const linked = !!b.routeId;
    console.log(
      `  - ${b.plateNumber} (${b.routeName || 'no name'}): routeId=${linked ? 'OK' : 'MISSING'} status=${b.status}`,
    );
    if (!linked) issues.push(`Bus ${b.plateNumber} has no routeId — parents cannot load stops`);
  }

  const parents = await client.query(
    `SELECT id, name, mobile_number AS phone, "busId", route_stop_id AS "routeStopId",
            return_route_stop_id AS "returnRouteStopId", "schoolId"
     FROM users WHERE role = 'parent' ORDER BY "createdAt" DESC NULLS LAST LIMIT 40`,
  );
  console.log(`\nParents: ${parents.rowCount}`);
  for (const p of parents.rows) {
    const ok = !!p.busId && !!p.routeStopId;
    console.log(
      `  - ${p.name || p.phone}: busId=${p.busId ? 'OK' : 'MISSING'} routeStopId=${p.routeStopId ? 'OK' : 'MISSING'}`,
    );
    if (!ok) issues.push(`Parent ${p.name || p.phone} missing busId and/or routeStopId`);
  }

  const drivers = await client.query(
    `SELECT u.id, u.name, u.mobile_number AS phone, bd."busId", bd."isActive"
     FROM users u
     LEFT JOIN bus_drivers bd ON bd."driverId" = u.id AND bd."isActive" = true
     WHERE u.role = 'driver'
     ORDER BY u."createdAt" DESC NULLS LAST
     LIMIT 30`,
  );
  console.log(`\nDrivers: ${drivers.rowCount}`);
  for (const d of drivers.rows) {
    console.log(`  - ${d.name || d.phone}: assignedBus=${d.busId ? 'OK' : 'MISSING'}`);
    if (!d.busId) issues.push(`Driver ${d.name || d.phone} has no active bus assignment`);
  }

  const orphans = await client.query(
    `SELECT u.id, u.name, u.route_stop_id AS "routeStopId"
     FROM users u
     WHERE u.role = 'parent'
       AND u.route_stop_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM route_stops rs WHERE rs.id::text = u.route_stop_id
       )`,
  );
  if (orphans.rowCount > 0) {
    console.log(`\nOrphan pickup stops: ${orphans.rowCount}`);
    for (const o of orphans.rows) {
      console.log(`  - ${o.name}: routeStopId=${o.routeStopId} (stop deleted — reassign parent)`);
      issues.push(`Parent ${o.name} has orphaned routeStopId`);
    }
  } else {
    console.log('\nOrphan pickup stops: 0');
  }

  // Complete chain count: parent with bus+stop, bus has routeId, school has coords, driver on bus
  const chains = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM users p
     JOIN buses b ON b.id::text = p."busId"::text AND b."routeId" IS NOT NULL
     JOIN schools s ON s.id::text = p."schoolId"::text AND s.lat IS NOT NULL AND s.lng IS NOT NULL
     JOIN bus_drivers bd ON bd."busId"::text = b.id::text AND bd."isActive" = true
     WHERE p.role = 'parent' AND p.route_stop_id IS NOT NULL`,
  );
  console.log(`\nComplete parent→bus→route→school→driver chains: ${chains.rows[0].n}`);
  if (chains.rows[0].n === 0) {
    issues.push('No complete map chain found (parent + bus.routeId + school coords + driver)');
  }

  await client.end();

  console.log('\n── Summary ──');
  if (issues.length === 0) {
    console.log('PASS: Core map data links look complete.');
    console.log('Still required at runtime: Maps/Directions keys, driver Start Trip, usable GPS.');
  } else {
    console.log(`ISSUES: ${issues.length}`);
    for (const i of issues) console.log(`  • ${i}`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Audit failed:', err.message || err);
  process.exit(1);
});
