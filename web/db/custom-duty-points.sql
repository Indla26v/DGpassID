-- Duty points added in the app, on top of the points seeded from the bandobast scheme.
-- A point belongs to a zone and sector, and to a sub-sector when the sector has sub-sectors ('' = none).
-- code is stable (e.g. N-Z2-S1-A-001) and is what officers' police_point_code refers to. Safe to run again.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS custom_duty_points (
  code varchar(32) PRIMARY KEY,
  zone varchar(120) NOT NULL,
  sector varchar(60) NOT NULL,
  sub_sector varchar(255) NOT NULL DEFAULT '',
  name varchar(255) NOT NULL CHECK (BTRIM(name) <> ''),
  created_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_duty_points_place_name
  ON custom_duty_points (zone, sector, sub_sector, LOWER(BTRIM(name)));

COMMIT;
