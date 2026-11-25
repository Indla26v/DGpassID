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
    ('INSPECTOROFPOLICE', 'CI'), ('DSP', 'DSP'), ('DYSP', 'DSP'), ('DEPUTYSUPERINTENDENTOFPOLICE', 'DSP'), ('ADDLSP', 'Addl. SP'), ('ADDITIONALSP', 'Addl. SP'),
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

COMMIT;
