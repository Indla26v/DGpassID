-- Local Officers per sector or sub-sector: contacts printed on duty passports below the incharges.
-- Any officer from the personnel directory may be attached, including one who is an incharge elsewhere.
-- A place can have several Local Officers, and one officer may be attached to many places across zones.
-- sub_sector '' = the whole sector; a sub-sector's own Local Officers take priority over its sector's.
-- Safe to run again.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS deployment_local_officers (
  zone varchar(120) NOT NULL,
  sector varchar(60) NOT NULL,
  sub_sector varchar(255) NOT NULL DEFAULT '',
  pass_id uuid NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  assigned_by varchar(255) NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (zone, sector, sub_sector, pass_id)
);
-- Earlier version allowed one officer per place: widen the key so several can be attached.
ALTER TABLE deployment_local_officers DROP CONSTRAINT IF EXISTS deployment_local_officers_pkey;
ALTER TABLE deployment_local_officers ADD CONSTRAINT deployment_local_officers_pkey PRIMARY KEY (zone, sector, sub_sector, pass_id);
CREATE INDEX IF NOT EXISTS idx_deployment_local_officers_pass ON deployment_local_officers (pass_id);

COMMIT;
