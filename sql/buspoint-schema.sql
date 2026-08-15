-- =============================================================================
-- BusPoint PostgreSQL schema dump
-- Generated from TypeORM entities (schema only — no live row data).
-- Compatible with local Postgres and Supabase.
--
-- Restore:
--   createdb buspoint
--   psql -d buspoint -f sql/buspoint-schema.sql
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (TypeORM default names: {table}_{column}_enum)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "users_role_enum" AS ENUM ('admin', 'driver', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "users_gender_enum" AS ENUM ('male', 'female', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "buses_status_enum" AS ENUM (
    'idle', 'started', 'at_school', 'returning', 'ended',
    'gps_lost', 'inactive', 'maintenance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "roles_name_enum" AS ENUM ('SCHOOL_ADMIN', 'DRIVER', 'PARENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptions_status_enum" AS ENUM ('active', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "content_entitytype_enum" AS ENUM ('USER', 'SCHOOL', 'BUS', 'DRIVER', 'ROUTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "content_contenttype_enum" AS ENUM (
    'PROFILE_PICTURE', 'COVER_PHOTO', 'PHOTO', 'DOCUMENT', 'VIDEO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bus_icons_category_enum" AS ENUM ('standard', 'festive', 'sport', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "access_requests_status_enum" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "schools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" character varying NOT NULL UNIQUE,
  "location" character varying NOT NULL,
  "information" text,
  "lat" double precision,
  "lng" double precision,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" "roles_name_enum" NOT NULL UNIQUE,
  "description" text,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firstName" character varying NOT NULL,
  "lastName" character varying NOT NULL,
  "name" character varying,
  "email" character varying NOT NULL UNIQUE,
  "password_hash" character varying,
  "firebase_uid" character varying UNIQUE,
  "mobile_number" character varying UNIQUE,
  "role" "users_role_enum" NOT NULL DEFAULT 'parent',
  "schoolId" character varying,
  "busId" character varying,
  "route_stop_id" character varying,
  "return_route_stop_id" character varying,
  "childName" character varying,
  "subStatus" character varying,
  "subExpiry" TIMESTAMPTZ,
  "homeLat" double precision,
  "homeLng" double precision,
  "fcmToken" character varying,
  "dateOfBirth" TIMESTAMP,
  "gender" "users_gender_enum",
  "address" character varying,
  "city" character varying,
  "country" character varying,
  "profilePicture" character varying,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- routes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schoolId" character varying NOT NULL,
  "name" character varying NOT NULL,
  "startLat" double precision NOT NULL,
  "startLng" double precision NOT NULL,
  "startAddress" character varying,
  "notes" character varying,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_routes_school"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_routes_schoolId" ON "routes" ("schoolId");

-- ---------------------------------------------------------------------------
-- route_stops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "route_stops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "routeId" character varying NOT NULL,
  "name" character varying NOT NULL,
  "title" character varying,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "address" character varying,
  "stopOrder" integer NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_route_stops_route"
    FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_route_stops_routeId" ON "route_stops" ("routeId");

-- ---------------------------------------------------------------------------
-- buses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "buses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schoolId" character varying NOT NULL,
  "plateNumber" character varying NOT NULL UNIQUE,
  "routeName" character varying,
  "routeId" character varying,
  "returnRouteName" character varying,
  "returnRouteId" character varying,
  "activeRouteId" character varying,
  "activeDirection" character varying DEFAULT 'outbound',
  "driverId" character varying,
  "status" "buses_status_enum" NOT NULL DEFAULT 'idle',
  "lastLat" double precision,
  "lastLng" double precision,
  "lastUpdated" TIMESTAMPTZ,
  "reachedStopIds" text,
  "capacity" integer,
  "make" character varying,
  "model" character varying,
  "year" integer,
  "color" character varying,
  "notes" character varying,
  "iconId" character varying,
  "iconUrl" character varying,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_buses_school"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_buses_schoolId" ON "buses" ("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_buses_routeId" ON "buses" ("routeId");

-- ---------------------------------------------------------------------------
-- bus_drivers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bus_drivers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "busId" character varying NOT NULL,
  "driverId" character varying NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassignedAt" TIMESTAMPTZ,
  "isActive" boolean NOT NULL DEFAULT true,
  "notes" character varying,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_bus_drivers_bus"
    FOREIGN KEY ("busId") REFERENCES "buses"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_bus_drivers_driver"
    FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_bus_drivers_busId" ON "bus_drivers" ("busId");
CREATE INDEX IF NOT EXISTS "IDX_bus_drivers_driverId" ON "bus_drivers" ("driverId");

-- ---------------------------------------------------------------------------
-- school_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "school_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" character varying NOT NULL,
  "schoolId" character varying NOT NULL,
  "roleId" character varying,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_school_users_user_school" UNIQUE ("userId", "schoolId"),
  CONSTRAINT "FK_school_users_user"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_school_users_school"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_school_users_role"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_school_users_userId" ON "school_users" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_school_users_schoolId" ON "school_users" ("schoolId");

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parentId" character varying NOT NULL,
  "schoolId" character varying NOT NULL,
  "status" "subscriptions_status_enum" NOT NULL DEFAULT 'active',
  "startDate" TIMESTAMPTZ NOT NULL,
  "expiryDate" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_subscriptions_parent"
    FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_subscriptions_school"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_parentId" ON "subscriptions" ("parentId");
CREATE INDEX IF NOT EXISTS "IDX_subscriptions_schoolId" ON "subscriptions" ("schoolId");

-- ---------------------------------------------------------------------------
-- content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType" "content_entitytype_enum" NOT NULL,
  "entityId" character varying NOT NULL,
  "contentType" "content_contenttype_enum" NOT NULL,
  "url" character varying NOT NULL,
  "fileName" character varying,
  "mimeType" character varying,
  "fileSize" bigint,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_content_entityType_entityId"
  ON "content" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "IDX_content_entityType_entityId_contentType"
  ON "content" ("entityType", "entityId", "contentType");

-- ---------------------------------------------------------------------------
-- bus_icons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bus_icons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" character varying NOT NULL,
  "url" character varying NOT NULL,
  "category" "bus_icons_category_enum" NOT NULL DEFAULT 'standard',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- access_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" character varying NOT NULL,
  "schoolName" character varying NOT NULL,
  "phone" character varying NOT NULL,
  "plan" character varying,
  "status" "access_requests_status_enum" NOT NULL DEFAULT 'pending',
  "rejectionReason" character varying,
  "provisionedSchoolId" character varying,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Seed: default roles
-- ---------------------------------------------------------------------------
INSERT INTO "roles" ("id", "name", "description")
VALUES
  (gen_random_uuid(), 'SCHOOL_ADMIN', 'School administrator'),
  (gen_random_uuid(), 'DRIVER', 'Bus driver'),
  (gen_random_uuid(), 'PARENT', 'Parent / guardian')
ON CONFLICT ("name") DO NOTHING;

COMMIT;
