BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION snapshot_office_signature()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.office_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.office_id = NEW.office_id AND OLD.authority_signature_url IS NOT NULL THEN
        NEW.authority_signature_url := OLD.authority_signature_url;
    ELSIF NEW.status IN ('APPROVED', 'READY_TO_PRINT')
       OR (NEW.pass_type = 'POLICE_FORCE' AND NEW.status = 'PRINTED') THEN
        SELECT NULLIF(signature_url, '') INTO NEW.authority_signature_url
        FROM pass_offices WHERE id = NEW.office_id;

        IF NEW.pass_type <> 'POLICE_FORCE' AND NEW.authority_signature_url IS NULL THEN
            RAISE EXCEPTION 'Set an authority signature for the assigned office before approving this pass.' USING ERRCODE = 'P6101';
        END IF;
    ELSE
        NEW.authority_signature_url := NULL;
    END IF;

    IF NEW.pass_type <> 'POLICE_FORCE' AND NEW.status IN ('PRINTED', 'ISSUED') AND NEW.authority_signature_url IS NULL THEN
        RAISE EXCEPTION 'Approve this office pass before printing or issuing it.' USING ERRCODE = 'P6101';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
