-- Execute as the database administrator, inside the provisioning transaction.
CREATE SCHEMA IF NOT EXISTS pass_analytics AUTHORIZATION dgp_analytics_executor;
REVOKE ALL ON SCHEMA pass_analytics FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dgp_analytics_executor;
GRANT SELECT (institution, category, department, personnel_type, status,
  printed_count, created_at, zone_a, zone_b, zone_c, office_id)
  ON public.passes TO dgp_analytics_executor;

CREATE OR REPLACE FUNCTION pass_analytics.snapshot(p_days integer, p_institution text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_days IS NULL OR p_days NOT IN (0, 7, 30, 90)
    OR p_institution IS NULL OR p_institution NOT IN ('ALL','IISER','IIT','ICU','OTHER') THEN
    RAISE EXCEPTION 'Invalid analytics filters' USING ERRCODE = '22023';
  END IF;
  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT COALESCE(NULLIF(UPPER(TRIM(institution)), ''), 'OTHER') AS institution,
        COALESCE(NULLIF(TRIM(category), ''), 'Unspecified') AS category,
        COALESCE(NULLIF(TRIM(department), ''), 'Unspecified') AS department,
        personnel_type, status, printed_count, zone_a, zone_b, zone_c, COALESCE(office_id, 'unassigned') AS office_id,
        (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
        (printed_count > 0 OR status IN ('PRINTED','ISSUED')) AS printed
      FROM public.passes
      WHERE (p_days = 0 OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >=
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - (p_days - 1))
      AND (p_institution = 'ALL' OR COALESCE(NULLIF(UPPER(TRIM(institution)), ''), 'OTHER') = p_institution)
    ), summary AS (
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE printed)::int AS printed,
        COUNT(*) FILTER (WHERE status = 'READY_TO_PRINT')::int AS ready,
        COUNT(*) FILTER (WHERE status IN ('DRAFT','PENDING_APPROVAL'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS issued,
        COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked,
        COALESCE(SUM(printed_count),0)::int AS "printRuns",
        COALESCE(SUM(GREATEST(printed_count-1,0)),0)::int AS reprints,
        COUNT(*) FILTER (WHERE day = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::int AS today,
        COUNT(*) FILTER (WHERE personnel_type = 'INTERNAL')::int AS internal,
        COUNT(*) FILTER (WHERE personnel_type = 'EXTERNAL')::int AS external,
        COUNT(*) FILTER (WHERE zone_a)::int AS "zoneA",
        COUNT(*) FILTER (WHERE zone_b)::int AS "zoneB",
        COUNT(*) FILTER (WHERE zone_c)::int AS "zoneC"
      FROM filtered
    ), office_names(id, name, sort_order) AS (
      VALUES ('chandragiri', 'Chandragiri Subdivision', 1),
             ('renigunta', 'Renigunta Subdivision', 2),
             ('tirupati', 'Tirupati Subdivision', 3),
             ('district', 'District Head Office', 4),
             ('unassigned', 'Unassigned', 5)
    ), office_counts AS (
      SELECT office_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('DRAFT', 'PENDING_APPROVAL'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'READY_TO_PRINT')::int AS ready,
        COUNT(*) FILTER (WHERE printed)::int AS printed,
        COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS issued,
        COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked
      FROM filtered GROUP BY office_id
    ), institutions AS (
      SELECT institution AS name, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE printed)::int AS printed,
        COUNT(*) FILTER (WHERE status='READY_TO_PRINT')::int AS ready
      FROM filtered GROUP BY 1
    ), categories AS (
      SELECT category AS name, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE printed)::int AS printed,
        COUNT(*) FILTER (WHERE status='READY_TO_PRINT')::int AS ready
      FROM filtered GROUP BY 1
    ), departments AS (
      SELECT department AS name, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE printed)::int AS printed,
        COUNT(*) FILTER (WHERE status='READY_TO_PRINT')::int AS ready
      FROM filtered GROUP BY 1
    ), statuses AS (
      SELECT status AS name, COUNT(*)::int AS total FROM filtered GROUP BY 1
    ), bounds AS (
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today
    ), dates AS (
      SELECT generate_series(
        CASE WHEN p_days=0 THEN LEAST(COALESCE((SELECT MIN(day) FROM filtered),today),today-13)
          ELSE today-(p_days-1) END, today, interval '1 day')::date AS day FROM bounds
    ), trend AS (
      SELECT TO_CHAR(d.day,'YYYY-MM-DD') AS date,COUNT(f.day)::int AS total
      FROM dates d LEFT JOIN filtered f ON f.day=d.day GROUP BY d.day
    )
    SELECT jsonb_build_object(
      'updatedAt', CURRENT_TIMESTAMP,
      'filters',jsonb_build_object('days',p_days,'institution',p_institution),
      'summary',(SELECT to_jsonb(s) FROM summary s),
      'offices',(SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'name', n.name, 'total', COALESCE(c.total, 0),
        'pending', COALESCE(c.pending, 0), 'ready', COALESCE(c.ready, 0),
        'printed', COALESCE(c.printed, 0), 'issued', COALESCE(c.issued, 0),
        'revoked', COALESCE(c.revoked, 0)) ORDER BY n.sort_order)
        FROM office_names n LEFT JOIN office_counts c ON c.office_id = n.id),
      'institutions',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY total DESC,name) FROM institutions i),'[]'::jsonb),
      'categories',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY total DESC,name) FROM categories c),'[]'::jsonb),
      'departments',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY total DESC,name) FROM departments d),'[]'::jsonb),
      'statuses',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY total DESC,name) FROM statuses s),'[]'::jsonb),
      'trend',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY date) FROM trend t),'[]'::jsonb)
    )
  );
END;
$function$;
ALTER FUNCTION pass_analytics.snapshot(integer,text) OWNER TO dgp_analytics_executor;
REVOKE ALL ON FUNCTION pass_analytics.snapshot(integer,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA pass_analytics TO dgp_analytics_reader;
GRANT EXECUTE ON FUNCTION pass_analytics.snapshot(integer,text) TO dgp_analytics_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE dgp_analytics_executor IN SCHEMA pass_analytics REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
