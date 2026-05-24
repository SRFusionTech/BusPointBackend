/**
 * Standalone seeder: inserts a sample Route + RouteStops for Aditya High School.
 *
 * Usage (from BusPointBackend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-sample-route.ts
 *
 * Idempotent — re-running with the same route name skips if it already exists.
 * Does not modify any other data.
 */

import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { School } from '../src/schools/entities/school.entity';
import { Route } from '../src/routes/entities/route.entity';
import { RouteStop } from '../src/routes/entities/route-stop.entity';

const SCHOOL_NAME = 'Aditya High School';
const ROUTE_NAME = 'Morning Route — Banjara Hills';

// Hyderabad fallback coordinates (Banjara Hills area)
const FALLBACK_SCHOOL: [number, number] = [17.4129, 78.435];

// Starting point — bus depot near Madhapur
const START: { lat: number; lng: number; address: string } = {
  lat: 17.4485,
  lng: 78.3915,
  address: 'Bus Depot, Madhapur, Hyderabad',
};

const STOPS: Array<{ name: string; lat: number; lng: number; address: string }> = [
  { name: 'Jubilee Hills Check Post',  lat: 17.431, lng: 78.418, address: 'Jubilee Hills Check Post, Hyderabad' },
  { name: 'Road No. 12, Banjara Hills', lat: 17.418, lng: 78.426, address: 'Road No. 12, Banjara Hills, Hyderabad' },
  { name: 'Punjagutta Cross Roads',     lat: 17.429, lng: 78.454, address: 'Punjagutta, Hyderabad' },
  { name: 'Somajiguda Circle',          lat: 17.422, lng: 78.463, address: 'Somajiguda, Hyderabad' },
];

function buildDataSource(): DataSource {
  const databaseUrl = process.env.DATABASE_URL;
  const baseSsl = databaseUrl ? { rejectUnauthorized: false } : false;

  if (databaseUrl) {
    return new DataSource({
      type: 'postgres',
      url: databaseUrl,
      ssl: baseSsl,
      entities: [School, Route, RouteStop],
      synchronize: false,
      logging: false,
    });
  }

  return new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    database: process.env.POSTGRES_DB ?? 'buspoint',
    entities: [School, Route, RouteStop],
    synchronize: false,
    logging: false,
  });
}

async function main() {
  const ds = buildDataSource();
  await ds.initialize();
  console.log('Connected to database.');

  try {
    const schoolRepo = ds.getRepository(School);
    const routeRepo = ds.getRepository(Route);
    const stopRepo = ds.getRepository(RouteStop);

    // 1. Find the school by name (exact match)
    const school = await schoolRepo.findOneBy({ name: SCHOOL_NAME });
    if (!school) {
      console.error(`School "${SCHOOL_NAME}" not found. Aborting.`);
      console.error('Available schools:');
      const all = await schoolRepo.find({ select: { id: true, name: true } });
      all.forEach((s) => console.error(`  - ${s.name} (${s.id})`));
      process.exit(1);
    }
    console.log(`Found school: ${school.name} (${school.id})`);

    // 2. Make sure the school has coordinates so the admin map renders. Don't
    //    overwrite admin-set coordinates if they already exist.
    if (school.lat == null || school.lng == null) {
      school.lat = FALLBACK_SCHOOL[0];
      school.lng = FALLBACK_SCHOOL[1];
      await schoolRepo.save(school);
      console.log(`Set fallback school location: ${school.lat}, ${school.lng}`);
    } else {
      console.log(`School already has coordinates: ${school.lat}, ${school.lng}`);
    }

    // 3. Idempotency — skip if this exact route name already exists for the school
    const existing = await routeRepo.findOne({
      where: { schoolId: school.id, name: ROUTE_NAME },
    });
    if (existing) {
      console.log(`Route "${ROUTE_NAME}" already exists (id=${existing.id}). Nothing to do.`);
      return;
    }

    // 4. Create route + stops
    const route = await routeRepo.save(
      routeRepo.create({
        schoolId: school.id,
        name: ROUTE_NAME,
        startLat: START.lat,
        startLng: START.lng,
        startAddress: START.address,
        notes: 'Sample route generated for testing — 4 pickup points in Hyderabad.',
      }),
    );
    console.log(`Created route: ${route.name} (${route.id})`);

    const stops = await stopRepo.save(
      STOPS.map((s, idx) =>
        stopRepo.create({
          routeId: route.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          stopOrder: idx,
        }),
      ),
    );
    console.log(`Created ${stops.length} pickup stops.`);

    console.log('Done.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err?.message ?? err);
  process.exit(1);
});
