-- Road-following path per trip leg (Google encoded polylines), fetched once at trip start.
-- roadLegs[i] = stop seq i → seq i+1. NULL = not fetched; clients fall back to straight lines.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS road_legs jsonb NULL DEFAULT NULL;
