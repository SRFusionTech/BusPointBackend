// One-shot read-only diagnostic for live tracking link health.
// Delete after use. Set SUPABASE_DATABASE_URL before running.
import { Client } from 'pg';

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('Set SUPABASE_DATABASE_URL'); process.exit(1); }

async function main() {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const counts = await c.query(`
    SELECT
      (SELECT count(*) FROM users WHERE role='parent') AS parents,
      (SELECT count(*) FROM users WHERE role='driver') AS drivers,
      (SELECT count(*) FROM users WHERE role='admin')  AS admins,
      (SELECT count(*) FROM buses) AS buses,
      (SELECT count(*) FROM bus_drivers WHERE "isActive"=true) AS active_assignments
  `);
  console.log('--- Totals ---');
  console.log(counts.rows[0]);

  console.log('\n--- Parents WITH "busId" (will see tracking UI) ---');
  const parents = await c.query(`
    SELECT id, name, "firstName", "lastName", mobile_number, email, "busId", "childName"
    FROM users WHERE role='parent' AND "busId" IS NOT NULL ORDER BY name LIMIT 20
  `);
  if (parents.rowCount === 0) console.log('  (none)');
  else for (const p of parents.rows) console.log(' ', p);

  console.log('\n--- Parents WITHOUT busId (will see "No bus assigned") ---');
  const orphans = await c.query(`
    SELECT id, name, "firstName", "lastName", mobile_number FROM users
    WHERE role='parent' AND "busId" IS NULL LIMIT 10
  `);
  console.log(`  count: ${orphans.rowCount}`);
  for (const p of orphans.rows) console.log(' ', p);

  console.log('\n--- Buses + last known GPS ---');
  const buses = await c.query(`
    SELECT id, "plateNumber", status, "lastLat", "lastLng", "lastUpdated", "routeId", "driverId"
    FROM buses ORDER BY "plateNumber"
  `);
  if (buses.rowCount === 0) console.log('  (no buses exist)');
  for (const b of buses.rows) console.log(' ', b);

  console.log('\n--- Active driver→bus assignments (required for GPS push) ---');
  const assigns = await c.query(`
    SELECT bd."busId", bd."driverId", u.name AS driver_name, u.mobile_number,
           b."plateNumber", bd."assignedAt"
    FROM bus_drivers bd
    LEFT JOIN users u ON u.id = bd."driverId"
    LEFT JOIN buses b ON b.id = bd."busId"
    WHERE bd."isActive" = true ORDER BY b."plateNumber"
  `);
  if (assigns.rowCount === 0) console.log('  (none) — no driver can push GPS for any bus');
  for (const a of assigns.rows) console.log(' ', a);

  console.log('\n--- Drivers without an active bus assignment ---');
  const unassigned = await c.query(`
    SELECT id, name, mobile_number, "busId" FROM users
    WHERE role='driver'
      AND id NOT IN (SELECT "driverId" FROM bus_drivers WHERE "isActive"=true)
  `);
  console.log(`  count: ${unassigned.rowCount}`);
  for (const d of unassigned.rows) console.log(' ', d);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
