/**
 * Deployment service — data access for SP selection, allotment and duty-point assignment.
 * Reads and writes officer duty columns on `passes` (owned by the personnel/roster service today)
 * and its own `deployment_batches` table.
 */
import { query, withTransaction } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { DEFAULT_AGE_CUTOFF_YEARS } from '@/lib/officer-age';

export const policeDistrictSql = "COALESCE(NULLIF(BTRIM(police_unit_district), ''), NULLIF(BTRIM(institution_other), ''), 'Tirupati')";

export interface DeploymentOfficer {
  id: string;
  pass_number: string;
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  district: string;
  mobile_number: string;
  date_of_birth: string | null;
  age_years: number | null;
  police_zone: string | null;
  police_sector_number: string | null;
  police_sector_name: string | null;
  police_point_code: string | null;
  police_point_name: string | null;
  distribution_status: string | null;
  status: string;
  printed_count: number;
}

const officerFields = `id, pass_number, full_name, rank, police_id_number, ${policeDistrictSql} AS district, mobile_number,
  date_of_birth, age_years, police_zone, police_sector_number, police_sector_name, police_point_code, police_point_name,
  distribution_status, status, printed_count`;

export async function getAgeCutoffYears(): Promise<number> {
  const res = await query<{ value: string }>("SELECT value FROM conference_configs WHERE key = 'age_cutoff_years'");
  const value = Number(res.rows[0]?.value);
  return Number.isInteger(value) && value >= 20 && value <= 70 ? value : DEFAULT_AGE_CUTOFF_YEARS;
}

export async function setAgeCutoffYears(value: number): Promise<void> {
  await query(
    `INSERT INTO conference_configs (key, value, description)
     VALUES ('age_cutoff_years', $1, 'Officers this age or older count as "old" in the ASI/HC 40:60 old:young selection.')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(value)],
  );
}

/** Officers of the given ranks and districts, eligible for SP selection. */
export async function listSelectionPool(ranks: string[], districts: string[], includeAllotted: boolean): Promise<DeploymentOfficer[]> {
  const params: unknown[] = [ranks.map(rank => rank.toUpperCase())];
  const where = [
    "pass_type = 'POLICE_FORCE'",
    "status <> 'REVOKED'",
    'UPPER(rank) = ANY($1::text[])',
  ];
  if (districts.length) {
    params.push(districts.map(district => district.toLowerCase()));
    where.push(`LOWER(${policeDistrictSql}) = ANY($${params.length}::text[])`);
  }
  if (!includeAllotted) where.push("NULLIF(BTRIM(police_zone), '') IS NULL");
  const res = await query<DeploymentOfficer>(
    `SELECT ${officerFields} FROM passes WHERE ${where.join(' AND ')} ORDER BY full_name LIMIT 20000`,
    params,
  );
  return res.rows;
}

export interface AllotmentInput {
  passIds: string[];
  zone: string;
  sectorNumber: string;
  sectorName: string;
  rankGroup: string;
  districts: string[];
  requestedCount: number;
  composition: unknown;
}

/** Allots officers to a zone and sector (clearing any sub-sector or point) and records the SP batch. */
export async function allotOfficers(input: AllotmentInput, actor: SessionUser): Promise<{ batchId: string; allotted: number }> {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(6102028)');
    const batch = await client.query<{ id: string }>(
      `INSERT INTO deployment_batches (created_by, rank_group, districts, requested_count, allotted_count, composition, police_zone, police_sector_number)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7) RETURNING id`,
      [actor.email, input.rankGroup, JSON.stringify(input.districts), Math.max(1, input.requestedCount),
        JSON.stringify(input.composition ?? {}), input.zone, input.sectorNumber],
    );
    const batchId = batch.rows[0].id;
    const updated = await client.query<{ id: string; pass_number: string; office_id: string | null }>(
      `UPDATE passes
          SET police_zone = $2,
              police_sector_number = $3,
              police_sector_name = $4,
              police_custom_sector = NULL,
              police_point_code = NULL,
              police_point_name = NULL,
              deployment_batch_id = $5,
              distribution_status = CASE WHEN distribution_status = 'COLLECTED' OR collected_by_officer THEN distribution_status ELSE 'ASSIGNED' END,
              updated_at = NOW()
        WHERE id = ANY($1::uuid[]) AND pass_type = 'POLICE_FORCE' AND status <> 'REVOKED'
        RETURNING id, pass_number, office_id`,
      [input.passIds, input.zone, input.sectorNumber, input.sectorName, batchId],
    );
    await client.query('UPDATE deployment_batches SET allotted_count = $2 WHERE id = $1', [batchId, updated.rowCount ?? 0]);
    await client.query(
      `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
       SELECT u.id, u.pass_number, 'DUTY_ALLOTTED', $2, $3, $4, u.office_id
         FROM jsonb_to_recordset($1::jsonb) AS u(id uuid, pass_number text, office_id text)`,
      [JSON.stringify(updated.rows), actor.email, actor.role,
        `SP selection (${input.rankGroup}) allotted to ${input.zone} - ${input.sectorNumber}. Batch ${batchId}.`],
    );
    return { batchId, allotted: updated.rowCount ?? 0 };
  });
}

/** SQL condition limiting passes to the actor's zone / sector scope (SP sees everything). */
function scopeCondition(actor: SessionUser, params: unknown[]): string {
  if (actor.role === 'ADMIN') return 'TRUE';
  params.push(actor.id);
  return `EXISTS (
    SELECT 1 FROM app_users u CROSS JOIN LATERAL jsonb_array_elements(u.police_print_scope) AS assignment
     WHERE u.id = $${params.length} AND u.role = 'BANDOBAST_OFFICER' AND u.is_active
       AND assignment->>'zone' = passes.police_zone
       AND (assignment->>'sector' IS NULL OR assignment->>'sector' = passes.police_sector_number))`;
}

/** Officers allotted inside the given zone (and optionally sector) that the actor may manage. */
export async function listAllottedOfficers(actor: SessionUser, zone: string, sectorNumber?: string): Promise<DeploymentOfficer[]> {
  const params: unknown[] = [zone];
  const where = ["pass_type = 'POLICE_FORCE'", "status <> 'REVOKED'", 'police_zone = $1'];
  if (sectorNumber) {
    params.push(sectorNumber);
    where.push(`police_sector_number = $${params.length}`);
  }
  where.push(scopeCondition(actor, params));
  const res = await query<DeploymentOfficer>(
    `SELECT ${officerFields} FROM passes WHERE ${where.join(' AND ')}
      ORDER BY police_sector_number, police_point_code NULLS FIRST, full_name LIMIT 20000`,
    params,
  );
  return res.rows;
}

export interface PointAssignmentInput {
  passIds: string[];
  zone: string;
  sectorNumber: string;
  /** Stored in police_sector_name: the sub-sector when chosen, otherwise the sector name. */
  sectorName: string;
  pointCode: string | null;
  pointName: string | null;
  /** True when the actor may move officers between sectors of the zone. */
  canChangeSector: boolean;
}

export async function assignDutyPoint(input: PointAssignmentInput, actor: SessionUser): Promise<{ updated: number; rejected: number }> {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(6102028)');
    const params: unknown[] = [input.passIds, input.zone, input.sectorNumber, input.sectorName, input.pointCode, input.pointName,
      input.canChangeSector];
    const scope = scopeCondition(actor, params);
    const updated = await client.query<{ id: string; pass_number: string; office_id: string | null }>(
      `UPDATE passes
          SET police_sector_number = $3,
              police_sector_name = $4,
              police_custom_sector = NULL,
              police_point_code = $5,
              police_point_name = $6,
              distribution_status = CASE WHEN distribution_status = 'COLLECTED' OR collected_by_officer THEN distribution_status ELSE 'ASSIGNED' END,
              updated_at = NOW()
        WHERE id = ANY($1::uuid[]) AND pass_type = 'POLICE_FORCE' AND police_zone = $2
          AND ($7::boolean OR police_sector_number = $3)
          AND ${scope}
        RETURNING id, pass_number, office_id`,
      params,
    );
    if (updated.rowCount) {
      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
         SELECT u.id, u.pass_number, 'DUTY_POINT_ASSIGNED', $2, $3, $4, u.office_id
           FROM jsonb_to_recordset($1::jsonb) AS u(id uuid, pass_number text, office_id text)`,
        [JSON.stringify(updated.rows), actor.email, actor.role,
          `Duty posting: ${input.zone} - ${input.sectorNumber} - ${input.sectorName}` + (input.pointName ? ` - ${input.pointName}` : ' (no point)') + '.'],
      );
    }
    return { updated: updated.rowCount ?? 0, rejected: input.passIds.length - (updated.rowCount ?? 0) };
  });
}

export interface PoliceExportFilters {
  zone?: string;
  sectorNumber?: string;
  /** Limit to these sectors (zone/sector officers without a whole-zone scope). */
  sectorNumbers?: string[];
  districts: string[];
  ranks: string[];
  duty?: 'ALLOTTED' | 'NOT_ALLOTTED' | 'ON_POINT';
}

export interface PoliceExportRow extends DeploymentOfficer {
  police_custom_sector: string | null;
  security_component: string | null;
}

/** Police officers matching any combination of zone, sector, districts, ranks and duty state. */
export async function listOfficersForExport(filters: PoliceExportFilters, limit = 20000): Promise<{ total: number; rows: PoliceExportRow[] }> {
  const params: unknown[] = [];
  const where = ["pass_type = 'POLICE_FORCE'", "status <> 'REVOKED'"];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.replaceAll('?', `$${params.length}`)); };
  if (filters.zone) add('police_zone = ?', filters.zone);
  if (filters.sectorNumber) add('police_sector_number = ?', filters.sectorNumber);
  if (filters.sectorNumbers?.length) add('police_sector_number = ANY(?::text[])', filters.sectorNumbers);
  if (filters.districts.length) add(`LOWER(${policeDistrictSql}) = ANY(?::text[])`, filters.districts.map(item => item.toLowerCase()));
  if (filters.ranks.length) add('UPPER(rank) = ANY(?::text[])', filters.ranks.map(item => item.toUpperCase()));
  if (filters.duty === 'ALLOTTED') where.push("NULLIF(BTRIM(police_zone), '') IS NOT NULL");
  if (filters.duty === 'NOT_ALLOTTED') where.push("NULLIF(BTRIM(police_zone), '') IS NULL");
  if (filters.duty === 'ON_POINT') where.push("NULLIF(BTRIM(police_point_code), '') IS NOT NULL");
  const clause = where.join(' AND ');
  const count = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM passes WHERE ${clause}`, params);
  params.push(limit);
  const res = await query<PoliceExportRow>(
    `SELECT ${officerFields}, police_custom_sector, security_component FROM passes WHERE ${clause}
      ORDER BY police_zone NULLS LAST, police_sector_number NULLS LAST, police_sector_name, police_point_code NULLS LAST, rank, full_name
      LIMIT $${params.length}`,
    params,
  );
  return { total: Number(count.rows[0]?.n ?? 0), rows: res.rows };
}

/** Officers already allotted to a sector, counted by stored rank (and by sub-sector, held in police_sector_name). */
export async function sectorRankCounts(zone: string, sectorNumber: string): Promise<{ rank: string; sector_name: string | null; count: number }[]> {
  const res = await query<{ rank: string | null; sector_name: string | null; count: string }>(
    `SELECT COALESCE(rank, '') AS rank, police_sector_name AS sector_name, COUNT(*)::text AS count
       FROM passes
      WHERE pass_type = 'POLICE_FORCE' AND status <> 'REVOKED' AND police_zone = $1 AND police_sector_number = $2
      GROUP BY rank, police_sector_name`,
    [zone, sectorNumber],
  );
  return res.rows.map(row => ({ rank: row.rank ?? '', sector_name: row.sector_name, count: Number(row.count) }));
}

/** Zones and sectors the actor manages; null sector means the whole zone. */
export function deploymentScopeOf(actor: SessionUser): PolicePrintScope[] | 'ALL' {
  return actor.role === 'ADMIN' ? 'ALL' : actor.policePrintScope ?? [];
}
