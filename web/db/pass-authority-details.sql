-- Run after apply-authority-signature.sql. Existing printed passes retain their snapshots.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE passes
    ADD COLUMN IF NOT EXISTS authority_name text,
    ADD COLUMN IF NOT EXISTS authority_title text;

ALTER TABLE pass_offices ADD COLUMN IF NOT EXISTS signature_preset jsonb;

CREATE OR REPLACE FUNCTION pass_authority_config(p_office_id text)
RETURNS TABLE (signature_url text, authority_name text, authority_title text)
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(o.signature_url, ''), COALESCE(NULLIF(o.authority_name, ''), o.name),
           COALESCE(NULLIF(o.authority_title, ''), o.name)
    FROM pass_offices o WHERE o.id = p_office_id
    UNION ALL
    SELECT MAX(NULLIF(value, '')) FILTER (WHERE key = 'authority_signature_url'),
           MAX(NULLIF(value, '')) FILTER (WHERE key = 'issuing_authority_name'),
           MAX(NULLIF(value, '')) FILTER (WHERE key = 'issuing_authority_title')
    FROM conference_configs
    WHERE key IN ('authority_signature_url', 'issuing_authority_name', 'issuing_authority_title')
    HAVING p_office_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION snapshot_pass_authority_details()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR OLD.office_id IS DISTINCT FROM NEW.office_id
       OR (OLD.status IN ('DRAFT', 'PENDING_APPROVAL')
           AND NEW.status IN ('APPROVED', 'READY_TO_PRINT')
           AND OLD.authority_signature_url IS NULL) THEN
        SELECT c.authority_name, c.authority_title INTO NEW.authority_name, NEW.authority_title
        FROM pass_authority_config(NEW.office_id) c;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER zz_snapshot_pass_authority_details
BEFORE INSERT OR UPDATE OF office_id, status ON passes
FOR EACH ROW EXECUTE FUNCTION snapshot_pass_authority_details();

CREATE OR REPLACE FUNCTION apply_saved_authority_signature_to_unprinted(p_office_id text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    saved_signature text;
    saved_name text;
    saved_title text;
    updated_count integer;
    targeted_count integer;
    prior_office text := current_setting('dgp.apply_signature_office', true);
BEGIN
    SELECT c.signature_url, c.authority_name, c.authority_title
    INTO saved_signature, saved_name, saved_title FROM pass_authority_config(p_office_id) c;

    PERFORM set_config('dgp.apply_signature_office', COALESCE(p_office_id, ''), true);
    WITH eligible AS (
        SELECT id FROM passes
        WHERE office_id IS NOT DISTINCT FROM p_office_id
          AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT')
          AND printed_count = 0
          AND last_printed_at IS NULL
          AND (authority_signature_url IS DISTINCT FROM COALESCE(saved_signature, authority_signature_url)
               OR authority_name IS DISTINCT FROM saved_name
               OR authority_title IS DISTINCT FROM saved_title)
        ORDER BY id
        FOR UPDATE
    ), updated AS (
        UPDATE passes AS pass
        SET authority_signature_url = COALESCE(saved_signature, pass.authority_signature_url),
            authority_name = saved_name, authority_title = saved_title, updated_at = NOW()
        FROM eligible
        WHERE pass.id = eligible.id
        RETURNING pass.authority_signature_url, pass.authority_name, pass.authority_title
    )
    SELECT COUNT(*), COUNT(*) FILTER (
        WHERE (saved_signature IS NULL OR authority_signature_url = saved_signature)
          AND authority_name IS NOT DISTINCT FROM saved_name
          AND authority_title IS NOT DISTINCT FROM saved_title
    ) INTO targeted_count, updated_count
    FROM updated;

    IF targeted_count <> updated_count THEN
        RAISE EXCEPTION 'The saved authority signature could not be applied to every selected pass.';
    END IF;
    PERFORM set_config('dgp.apply_signature_office', COALESCE(prior_office, ''), true);
    RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION apply_saved_office_signature()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.office_id = NEW.office_id
       AND OLD.status = NEW.status
       AND OLD.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT')
       AND OLD.printed_count = 0
       AND OLD.last_printed_at IS NULL THEN
        -- The existing snapshot trigger preserves the old image on updates.
        SELECT COALESCE(NULLIF(o.signature_url, ''), OLD.authority_signature_url)
        INTO NEW.authority_signature_url
        FROM pass_offices o WHERE o.id = NEW.office_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER zz_apply_saved_office_signature
BEFORE UPDATE OF authority_signature_url ON passes
FOR EACH ROW
WHEN (OLD.office_id = current_setting('dgp.apply_signature_office', true))
EXECUTE FUNCTION apply_saved_office_signature();

COMMIT;
