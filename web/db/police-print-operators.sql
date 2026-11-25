BEGIN;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS police_print_scope jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN', 'PRINT_TEAM', 'POLICE_PRINT'));
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_police_print_scope_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_police_print_scope_check CHECK (
  jsonb_typeof(police_print_scope) = 'array' AND
  CASE WHEN role = 'POLICE_PRINT' THEN police_print_scope <> '[]'::jsonb
       ELSE police_print_scope = '[]'::jsonb END
);

COMMIT;
