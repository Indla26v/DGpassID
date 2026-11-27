-- Bandobast deployment: officer age, duty points, SP selection batches and zone/sector officers.
-- Apply after police-direct-print.sql. Safe to re-run.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Officer age for the ASI/HC old:young selection ratio.
ALTER TABLE passes
    ADD COLUMN IF NOT EXISTS date_of_birth date,
    ADD COLUMN IF NOT EXISTS age_years smallint CHECK (age_years IS NULL OR age_years BETWEEN 17 AND 75),
    -- Duty point inside the sector / sub-sector (code from bandobast-points.json, name kept as a snapshot).
    ADD COLUMN IF NOT EXISTS police_point_code varchar(32),
    ADD COLUMN IF NOT EXISTS police_point_name varchar(255),
    -- SP selection batch that allotted the officer to a zone and sector.
    ADD COLUMN IF NOT EXISTS deployment_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_passes_police_point ON passes (police_zone, police_sector_number, police_point_code);
CREATE INDEX IF NOT EXISTS idx_passes_police_rank_district ON passes (pass_type, rank);

CREATE TABLE IF NOT EXISTS deployment_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by varchar(254) NOT NULL,
    rank_group varchar(32) NOT NULL,
    districts jsonb NOT NULL DEFAULT '[]'::jsonb,
    requested_count integer NOT NULL CHECK (requested_count > 0),
    allotted_count integer NOT NULL CHECK (allotted_count >= 0),
    composition jsonb NOT NULL DEFAULT '{}'::jsonb,
    police_zone varchar(128) NOT NULL,
    police_sector_number varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Zone / sector officers reuse the zone-and-sector scope column of police print operators.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
    CHECK (role IN ('ADMIN', 'PRINT_TEAM', 'POLICE_PRINT', 'BANDOBAST_OFFICER'));
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_police_print_scope_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_police_print_scope_check CHECK (
    jsonb_typeof(police_print_scope) = 'array' AND
    CASE WHEN role IN ('POLICE_PRINT', 'BANDOBAST_OFFICER') THEN police_print_scope <> '[]'::jsonb
         ELSE police_print_scope = '[]'::jsonb END
);

-- Normalise stored police ranks to the canonical codes used by filters, selection and cards
-- (same alias table as web/src/core/domain/ranks.ts). Unknown ranks are left unchanged.
UPDATE passes p
   SET rank = m.canonical, updated_at = NOW()
  FROM (VALUES
    ('PC', 'PC'), ('CONSTABLE', 'PC'), ('POLICECONSTABLE', 'PC'), ('CIVILPC', 'PC'), ('WPC', 'WPC'), ('WOMANPC', 'WPC'),
    ('WOMENPC', 'WPC'), ('WOMANCONSTABLE', 'WPC'), ('WOMENCONSTABLE', 'WPC'), ('LPC', 'WPC'), ('HG', 'HG'), ('HOMEGUARD', 'HG'),
    ('HOMEGUARDS', 'HG'), ('HC', 'HC'), ('HEADCONSTABLE', 'HC'), ('CIVILHC', 'HC'), ('WHC', 'WHC'), ('WOMANHC', 'WHC'),
    ('WOMENHC', 'WHC'), ('WOMANHEADCONSTABLE', 'WHC'), ('WOMENHEADCONSTABLE', 'WHC'), ('LHC', 'WHC'), ('ASI', 'ASI'), ('ASSISTANTSUBINSPECTOR', 'ASI'),
    ('ASSTSUBINSPECTOR', 'ASI'), ('WASI', 'WASI'), ('WOMANASI', 'WASI'), ('WOMENASI', 'WASI'), ('WOMANASSISTANTSUBINSPECTOR', 'WASI'), ('LASI', 'WASI'),
    ('SI', 'SI'), ('SUBINSPECTOR', 'SI'), ('SIOFPOLICE', 'SI'), ('CI', 'CI'), ('CIRCLEINSPECTOR', 'CI'), ('INSPECTOR', 'CI'),
    ('INSPECTOROFPOLICE', 'CI'), ('DSP', 'DSP'), ('DYSP', 'DSP'), ('DEPUTYSUPERINTENDENTOFPOLICE', 'DSP'), ('ADDLSP', 'Addl. SP'), ('ASP', 'Addl. SP'), ('ADDITIONALSP', 'Addl. SP'),
    ('ADDLSUPERINTENDENTOFPOLICE', 'Addl. SP'), ('SP', 'SP'), ('SUPERINTENDENTOFPOLICE', 'SP'), ('ARPC', 'ARPC'), ('ARCONSTABLE', 'ARPC'), ('ARMEDRESERVEPC', 'ARPC'),
    ('ARMEDRESERVECONSTABLE', 'ARPC'), ('ARHC', 'ARHC'), ('ARHEADCONSTABLE', 'ARHC'), ('ARMEDRESERVEHC', 'ARHC'), ('ARMEDRESERVEHEADCONSTABLE', 'ARHC'), ('ARSI', 'ARSI'),
    ('ASSISTANTRESERVESUBINSPECTOR', 'ARSI'), ('ASSTRESERVESUBINSPECTOR', 'ARSI'), ('RSI', 'RSI'), ('RESERVESUBINSPECTOR', 'RSI'), ('RI', 'RI'), ('RESERVEINSPECTOR', 'RI')
  ) AS m(alias, canonical)
 WHERE p.pass_type = 'POLICE_FORCE'
   AND regexp_replace(upper(p.rank), '[^A-Z]', '', 'g') = m.alias
   AND p.rank IS DISTINCT FROM m.canonical;

INSERT INTO conference_configs (key, value, description)
VALUES ('age_cutoff_years', '45', 'Officers this age or older count as "old" in the ASI/HC 40:60 old:young selection.')
ON CONFLICT (key) DO NOTHING;

-- Force category (Civil / AR / STF / Others), police station ("Place of working") and gender.
ALTER TABLE passes
    ADD COLUMN IF NOT EXISTS force_category varchar(16),
    ADD COLUMN IF NOT EXISTS police_station varchar(255),
    ADD COLUMN IF NOT EXISTS gender varchar(8);
ALTER TABLE passes DROP CONSTRAINT IF EXISTS passes_force_category_check;
ALTER TABLE passes ADD CONSTRAINT passes_force_category_check
    CHECK (force_category IS NULL OR force_category IN ('CIVIL', 'AR', 'STF', 'OTHERS'));
ALTER TABLE passes DROP CONSTRAINT IF EXISTS passes_gender_check;
ALTER TABLE passes ADD CONSTRAINT passes_gender_check
    CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER'));
CREATE INDEX IF NOT EXISTS idx_passes_force_category ON passes (pass_type, force_category);

-- Backfill from rank (same rules as normalizeForce / normalizeGender in ranks.ts).
UPDATE passes
   SET force_category = CASE WHEN rank IN ('ARPC', 'ARHC', 'ARSI', 'RSI', 'RI') THEN 'AR' ELSE 'CIVIL' END
 WHERE pass_type = 'POLICE_FORCE' AND force_category IS NULL;
UPDATE passes
   SET gender = CASE WHEN upper(rank) ~ '^W(PC|HC|ASI|SI)$' THEN 'FEMALE' ELSE 'MALE' END
 WHERE pass_type = 'POLICE_FORCE' AND gender IS NULL;

-- Duty instructions sent by the SP to zone / sector logins.
CREATE TABLE IF NOT EXISTS duty_instructions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(200) NOT NULL,
    heading text NOT NULL DEFAULT '',
    closing text NOT NULL DEFAULT '',
    entries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(entries) = 'array'),
    targets jsonb NOT NULL CHECK (jsonb_typeof(targets) = 'array' AND targets <> '[]'::jsonb),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    revision_note text,
    created_by varchar(254) NOT NULL,
    updated_by varchar(254) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    withdrawn_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_duty_instructions_status ON duty_instructions (status, updated_at DESC);

COMMIT;

-- Audit labels for police personnel imports: relabel entries written under the older action names.
UPDATE audit_logs SET action = 'POLICE_PERSONNEL_IMPORT' WHERE action = 'POLICE_ROSTER_IMPORT';
UPDATE audit_logs SET action = 'POLICE_PERSONNEL_UPDATED',
       details = replace(details, 'Officer roster record', 'Officer personnel record')
 WHERE action = 'POLICE_ROSTER_UPDATED';

-- Duty passport details on each duty instruction (all optional).
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS duty_from date;
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS duty_to date;
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS duty_hours varchar(60);
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS security_plan text;
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS place_of_duty varchar(120);
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS signatory text;
ALTER TABLE duty_instructions DROP CONSTRAINT IF EXISTS duty_instructions_duty_period_check;
ALTER TABLE duty_instructions ADD CONSTRAINT duty_instructions_duty_period_check
  CHECK (duty_from IS NULL OR duty_to IS NULL OR duty_to >= duty_from);
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS batch varchar(60);

-- Sector Incharge (one per sector) and Component Officer (one per zone, sector = '') for duty passports.
CREATE TABLE IF NOT EXISTS deployment_incharges (
  zone varchar(120) NOT NULL,
  sector varchar(60) NOT NULL DEFAULT '',
  pass_id uuid NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  assigned_by varchar(255) NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (zone, sector)
);
CREATE INDEX IF NOT EXISTS idx_deployment_incharges_pass ON deployment_incharges (pass_id);

-- Sub-sector Incharge: one officer per sub-sector (sub_sector = '' for the Sector Incharge itself).
ALTER TABLE deployment_incharges ADD COLUMN IF NOT EXISTS sub_sector varchar(255) NOT NULL DEFAULT '';

-- Up to 3 officers per sub-sector, in order (position 1 = Sub-sector Incharge).
ALTER TABLE deployment_incharges ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 1;
ALTER TABLE deployment_incharges DROP CONSTRAINT IF EXISTS deployment_incharges_position_check;
ALTER TABLE deployment_incharges ADD CONSTRAINT deployment_incharges_position_check CHECK (position BETWEEN 1 AND 3);
ALTER TABLE deployment_incharges DROP CONSTRAINT IF EXISTS deployment_incharges_pkey;
ALTER TABLE deployment_incharges ADD CONSTRAINT deployment_incharges_pkey PRIMARY KEY (zone, sector, sub_sector, position);

-- Back side of the duty passport: "Brief Instructions" title and numbered points.
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS back_title varchar(200);
ALTER TABLE duty_instructions ADD COLUMN IF NOT EXISTS back_points jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE duty_instructions DROP CONSTRAINT IF EXISTS duty_instructions_back_points_check;
ALTER TABLE duty_instructions ADD CONSTRAINT duty_instructions_back_points_check CHECK (jsonb_typeof(back_points) = 'array');
