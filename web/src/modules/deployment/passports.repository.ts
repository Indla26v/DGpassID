/**
 * Duty passports and scan-to-issue: officer lookups limited to the caller's zones and sectors.
 */
import { query } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { isSeniorRank, type PassportOfficer, type SectorOfficer, type ZoneAccount } from '@/core/domain/duty-passport';
import type { InstructionTarget } from '@/core/domain/duty-instructions';
import { rankSeniority } from '@/core/domain/ranks';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { deploymentScopeOf } from './deployment.repository';

export interface PassportFilters {
  zone?: string;
  sector?: string;
  subSector?: string;
  /** Name or G.No. (case-insensitive, partial). */
  search?: string;
  ids?: string[];
}

/** SQL for "posting falls in one of these areas" (zone, sector or sub-sector); pushes its values onto params. */
function areaClause(areas: InstructionTarget[], params: unknown[]): string {
  if (!areas.length) return 'FALSE';
  return `(${areas.map(area => {
    params.push(area.zone);
    const zone = `$${params.length}`;
    if (area.sector === null) return `police_zone = ${zone}`;
    params.push(area.sector);
    const sector = `$${params.length}`;
    if (!area.subSector) return `(police_zone = ${zone} AND police_sector_number = ${sector})`;
    params.push(area.subSector);
    return `(police_zone = ${zone} AND police_sector_number = ${sector} AND police_sector_name = $${params.length})`;
  }).join(' OR ')})`;
}

function passportWhere(areas: InstructionTarget[], filters: PassportFilters, params: unknown[]): string {
  const where = [
    "pass_type = 'POLICE_FORCE'", "status <> 'REVOKED'",
    "NULLIF(BTRIM(police_zone), '') IS NOT NULL", "NULLIF(BTRIM(police_sector_number), '') IS NOT NULL",
    areaClause(areas, params),
  ];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.replaceAll('?', `$${params.length}`)); };
  if (filters.zone) add('police_zone = ?', filters.zone);
  if (filters.sector) add('police_sector_number = ?', filters.sector);
  if (filters.subSector) add('police_sector_name = ?', filters.subSector);
  if (filters.search) add("(full_name ILIKE ? OR police_id_number ILIKE ?)", `%${filters.search.replace(/[\\%_]/g, char => `\\${char}`)}%`);
  if (filters.ids?.length) add('id = ANY(?::uuid[])', filters.ids);
  return where.join(' AND ');
}

/** Officers for passports, in scheme order (zone, sector, sub-sector) then senior ranks first. */
export async function listPassportOfficers(areas: InstructionTarget[], filters: PassportFilters, limit: number): Promise<{ total: number; officers: PassportOfficer[] }> {
  const params: unknown[] = [];
  const clause = passportWhere(areas, filters, params);
  const count = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM passes WHERE ${clause}`, params);
  params.push(limit);
  const res = await query<PassportOfficer>(
    `SELECT id, full_name, rank, police_id_number, police_zone, police_sector_number, police_sector_name,
            police_point_code, police_point_name, qr_payload
       FROM passes WHERE ${clause}
      ORDER BY police_zone, police_sector_number, police_sector_name NULLS FIRST, full_name
      LIMIT $${params.length}`,
    params,
  );
  const zoneOrder = (name: string | null) => POLICE_BANDOBUSHT_ZONES.findIndex(zone => zone.name === name);
  const sectorOrder = (officer: PassportOfficer) => {
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === officer.police_zone);
    const sectorIndex = zone?.sectors.findIndex(item => item.number === officer.police_sector_number) ?? -1;
    const sector = zone?.sectors[sectorIndex];
    return [sectorIndex, sector?.subSectors?.indexOf(officer.police_sector_name ?? '') ?? -1];
  };
  const officers = res.rows.slice().sort((a, b) => {
    const [as, ass] = sectorOrder(a);
    const [bs, bss] = sectorOrder(b);
    return zoneOrder(a.police_zone) - zoneOrder(b.police_zone) || as - bs || ass - bss ||
      rankSeniority(a.rank) - rankSeniority(b.rank) || a.full_name.localeCompare(b.full_name);
  });
  return { total: Number(count.rows[0]?.n ?? 0), officers };
}

/** Officer counts by sector and sub-sector, for the print dialog. */
export async function passportCounts(areas: InstructionTarget[], filters: PassportFilters) {
  const params: unknown[] = [];
  const clause = passportWhere(areas, filters, params);
  const res = await query<{ zone: string; sector: string; sector_name: string | null; n: string }>(
    `SELECT police_zone AS zone, police_sector_number AS sector, police_sector_name AS sector_name, COUNT(*)::text AS n
       FROM passes WHERE ${clause} GROUP BY 1, 2, 3`,
    params,
  );
  return res.rows.map(row => ({ zone: row.zone, sector: row.sector, sectorName: row.sector_name, count: Number(row.n) }));
}

/** Officers of rank SI and above posted in these zones, for the senior officers in the passport footer. */
export async function listSectorSeniors(zones: string[]): Promise<SectorOfficer[]> {
  if (!zones.length) return [];
  const res = await query<SectorOfficer>(
    `SELECT id, police_zone AS zone, police_sector_number AS sector, police_sector_name AS sector_name, full_name, rank, mobile_number
       FROM passes
      WHERE pass_type = 'POLICE_FORCE' AND status <> 'REVOKED' AND police_zone = ANY($1::text[])
        AND NULLIF(BTRIM(police_sector_number), '') IS NOT NULL`,
    [zones],
  );
  return res.rows.filter(row => isSeniorRank(row.rank));
}

/** Active zone / sector logins with their areas, for the passport footer. */
export async function listZoneAccounts(): Promise<ZoneAccount[]> {
  const res = await query<{ name: string; police_print_scope: PolicePrintScope[] }>(
    "SELECT name, police_print_scope FROM app_users WHERE role = 'BANDOBAST_OFFICER' AND is_active ORDER BY name",
  );
  return res.rows.map(row => ({ name: row.name, scope: Array.isArray(row.police_print_scope) ? row.police_print_scope : [] }));
}

export interface ScannedOfficer {
  id: string;
  pass_number: string;
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  police_zone: string | null;
  police_sector_number: string | null;
  police_sector_name: string | null;
  photo_url: string | null;
  status: string;
  printed_count: number;
  collected_at: string | null;
  handover_officer_name: string | null;
}

/** Police officer by ID card token, only when their posting is in the caller's area (SP: any). */
export async function findScannedOfficer(token: string, actor: SessionUser): Promise<ScannedOfficer | null> {
  const params: unknown[] = [token];
  const scope = deploymentScopeOf(actor);
  const area = scope === 'ALL' ? 'TRUE' : areaClause(scope, params);
  const res = await query<ScannedOfficer>(
    `SELECT id, pass_number, full_name, rank, police_id_number, police_zone, police_sector_number, police_sector_name,
            photo_url, status, printed_count, collected_at, handover_officer_name
       FROM passes
      WHERE verification_token = $1 AND pass_type = 'POLICE_FORCE' AND status <> 'REVOKED' AND ${area}
      LIMIT 1`,
    params,
  );
  return res.rows[0] ?? null;
}
