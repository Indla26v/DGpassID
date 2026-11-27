-- Apply as the database owner after schema.sql and offices.sql, before deploying the web feature.
BEGIN;

CREATE OR REPLACE FUNCTION apply_saved_office_signature()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.office_id = NEW.office_id
       AND OLD.status = NEW.status
       AND OLD.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT')
       AND OLD.printed_count = 0
       AND OLD.last_printed_at IS NULL THEN
        SELECT signature_url INTO NEW.authority_signature_url
        FROM pass_offices WHERE id = NEW.office_id;
    END IF;
    RETURN NEW;
END;
$$;

-- PostgreSQL runs these BEFORE triggers in name order. Run after snapshot_office_signature,
-- which preserves signatures during ordinary approvals, edits and status changes.
CREATE OR REPLACE TRIGGER zz_apply_saved_office_signature
BEFORE UPDATE OF authority_signature_url ON passes
FOR EACH ROW
WHEN (OLD.office_id = current_setting('dgp.apply_signature_office', true))
EXECUTE FUNCTION apply_saved_office_signature();

CREATE OR REPLACE FUNCTION apply_saved_authority_signature_to_unprinted(p_office_id text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    saved_signature text;
    updated_count integer;
    prior_office text := current_setting('dgp.apply_signature_office', true);
BEGIN
    IF p_office_id IS NULL THEN
        SELECT value INTO saved_signature
        FROM conference_configs WHERE key = 'authority_signature_url';
    ELSE
        SELECT signature_url INTO saved_signature FROM pass_offices WHERE id = p_office_id;
    END IF;
    IF NULLIF(saved_signature, '') IS NULL THEN
        RAISE EXCEPTION 'Save an authority signature before applying it to unprinted passes.';
    END IF;

    PERFORM set_config('dgp.apply_signature_office', COALESCE(p_office_id, ''), true);

    -- Match the print queue's row lock order and recheck eligibility after concurrent updates.
    WITH eligible AS (
        SELECT id FROM passes
        WHERE office_id IS NOT DISTINCT FROM p_office_id
          AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT')
          AND printed_count = 0
          AND last_printed_at IS NULL
          AND authority_signature_url IS DISTINCT FROM saved_signature
        ORDER BY id
        FOR UPDATE
    )
    UPDATE passes AS pass
    SET authority_signature_url = saved_signature, updated_at = NOW()
    FROM eligible
    WHERE pass.id = eligible.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    PERFORM set_config('dgp.apply_signature_office', COALESCE(prior_office, ''), true);
    RETURN updated_count;
END;
$$;

COMMIT;
