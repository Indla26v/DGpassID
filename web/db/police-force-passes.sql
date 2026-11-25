BEGIN;
SET LOCAL lock_timeout = '5s';

-- Police roster imports have no campus institution.
ALTER TABLE passes ALTER COLUMN institution DROP NOT NULL;

-- Preserve the existing badge format for records created before the police roster.
ALTER TABLE passes
    ADD COLUMN IF NOT EXISTS pass_type varchar(32) NOT NULL DEFAULT 'CAMPUS',
    ADD COLUMN IF NOT EXISTS rank varchar(64),
    ADD COLUMN IF NOT EXISTS police_id_number varchar(64),
    ADD COLUMN IF NOT EXISTS police_unit_district varchar(128),
    ADD COLUMN IF NOT EXISTS police_zone varchar(128),
    ADD COLUMN IF NOT EXISTS police_sector_number varchar(64),
    ADD COLUMN IF NOT EXISTS police_sector_name varchar(255),
    ADD COLUMN IF NOT EXISTS police_custom_sector varchar(255),
    ADD COLUMN IF NOT EXISTS security_component varchar(128),
    ADD COLUMN IF NOT EXISTS custom_security_component varchar(255),
    ADD COLUMN IF NOT EXISTS issuing_counter_id varchar(64),
    ADD COLUMN IF NOT EXISTS distribution_status varchar(32) NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    ADD COLUMN IF NOT EXISTS collected_at timestamptz,
    ADD COLUMN IF NOT EXISTS collected_by_officer boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS handover_officer_name varchar(128),
    ADD COLUMN IF NOT EXISTS is_imported boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_passes_pass_type ON passes (pass_type);
CREATE INDEX IF NOT EXISTS idx_passes_police_id_mobile ON passes (police_id_number, mobile_number);
CREATE INDEX IF NOT EXISTS idx_passes_police_zone_sector ON passes (police_zone, police_sector_name);
CREATE INDEX IF NOT EXISTS idx_passes_counter_distribution ON passes (issuing_counter_id, distribution_status);
CREATE INDEX IF NOT EXISTS idx_passes_distribution_status ON passes (distribution_status);

COMMIT;
