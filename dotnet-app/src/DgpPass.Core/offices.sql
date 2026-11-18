-- Run after schema.sql. The .NET initializer applies both in one transaction.
CREATE TABLE IF NOT EXISTS pass_offices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    signature_url TEXT,
    authority_name TEXT,
    authority_title TEXT
);

INSERT INTO pass_offices (id, name) VALUES
    ('chandragiri', 'Chandragiri Subdivision'),
    ('renigunta', 'Renigunta Subdivision'),
    ('tirupati', 'Tirupati Subdivision'),
    ('district', 'District Head Office')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS office_id TEXT REFERENCES pass_offices(id) CHECK (role = 'ADMIN' OR office_id IS NULL);
ALTER TABLE passes ADD COLUMN IF NOT EXISTS office_id TEXT REFERENCES pass_offices(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS office_id TEXT REFERENCES pass_offices(id);
CREATE INDEX IF NOT EXISTS idx_passes_office_created ON passes(office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_office_created ON audit_logs(office_id, created_at DESC);

CREATE OR REPLACE FUNCTION pass_office_visible(scope TEXT, office TEXT)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT scope IS NULL OR scope = COALESCE(office, 'unassigned');
$$;

CREATE OR REPLACE FUNCTION snapshot_office_signature()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.office_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- A saved signature is retained even when an approved pass changes status.
    IF TG_OP = 'UPDATE' AND OLD.office_id = NEW.office_id AND OLD.authority_signature_url IS NOT NULL THEN
        NEW.authority_signature_url := OLD.authority_signature_url;
    ELSIF NEW.status IN ('APPROVED', 'READY_TO_PRINT') THEN
        SELECT signature_url INTO NEW.authority_signature_url FROM pass_offices WHERE id = NEW.office_id;
        IF NULLIF(NEW.authority_signature_url, '') IS NULL THEN
            RAISE EXCEPTION 'Set an authority signature for the assigned office before approving this pass.' USING ERRCODE = 'P6101';
        END IF;
    ELSE
        NEW.authority_signature_url := NULL;
    END IF;

    IF NEW.status IN ('PRINTED', 'ISSUED') AND NEW.authority_signature_url IS NULL THEN
        RAISE EXCEPTION 'Approve this office pass before printing or issuing it.' USING ERRCODE = 'P6101';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER snapshot_office_signature
BEFORE INSERT OR UPDATE OF status, office_id, authority_signature_url ON passes
FOR EACH ROW EXECUTE FUNCTION snapshot_office_signature();

CREATE OR REPLACE FUNCTION record_audit_office()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.pass_id IS NOT NULL THEN
        SELECT office_id INTO NEW.office_id FROM passes WHERE id = NEW.pass_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER record_audit_office
BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION record_audit_office();

CREATE OR REPLACE FUNCTION pass_office_statistics(scope TEXT)
RETURNS TABLE (id TEXT, name TEXT, total INTEGER, pending INTEGER, ready INTEGER,
               printed INTEGER, issued INTEGER, revoked INTEGER)
LANGUAGE sql STABLE AS $$
    WITH offices AS (
        SELECT o.id, o.name FROM pass_offices o
        UNION ALL SELECT 'unassigned', 'Unassigned'
    ), counts AS (
        SELECT COALESCE(office_id, 'unassigned') AS id, COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE status IN ('DRAFT', 'PENDING_APPROVAL')))::int AS pending,
            (COUNT(*) FILTER (WHERE status = 'READY_TO_PRINT'))::int AS ready,
            (COUNT(*) FILTER (WHERE printed_count > 0 OR status IN ('PRINTED', 'ISSUED')))::int AS printed,
            (COUNT(*) FILTER (WHERE status = 'ISSUED'))::int AS issued,
            (COUNT(*) FILTER (WHERE status = 'REVOKED'))::int AS revoked
        FROM passes WHERE pass_office_visible(scope, office_id) GROUP BY 1
    )
    SELECT o.id, o.name, COALESCE(c.total, 0), COALESCE(c.pending, 0), COALESCE(c.ready, 0),
           COALESCE(c.printed, 0), COALESCE(c.issued, 0), COALESCE(c.revoked, 0)
    FROM offices o LEFT JOIN counts c USING (id)
    WHERE scope IS NULL OR scope = o.id ORDER BY o.id = 'unassigned', o.id = 'district', o.id;
$$;
