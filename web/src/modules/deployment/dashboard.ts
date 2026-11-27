/**
 * Police Force dashboard figures: totals, zone → sector → sub-sector rank matrix (with scheme
 * requirements), and breakdowns by district, force, gender and rank.
 */
import { query } from '@/infrastructure/db/pool';
import { POLICE_BANDOBUSHT_ZONES, resolveDutyPosting } from '@/core/domain/police-zones';
import { AR_RANKS, normalizeRank, rankGroupOf } from '@/core/domain/ranks';
import { SCHEME_RANK_COLUMNS, schemeColumnOf, schemeRequirement, type RankRequirement } from '@/core/domain/scheme-requirements';
import { policeDistrictSql } from './deployment.repository';

export const DASHBOARD_COLUMNS = [...SCHEME_RANK_COLUMNS, 'AR', 'Others'] as const;
export type DashboardColumn = (typeof DASHBOARD_COLUMNS)[number];
export type ColumnCounts = Partial<Record<DashboardColumn, number>>;

export interface MatrixNode {
  key: string;
  label: string;
  counts: ColumnCounts;
  total: number;
  required: RankRequirement | null;
  children: MatrixNode[];
}

export interface PoliceDashboard {
  totals: { officers: number; allotted: number; onPoint: number; notAllotted: number; printed: number };
  matrix: MatrixNode[];
  byDistrict: { label: string; count: number }[];
  byForce: { label: string; count: number }[];
  byGender: { label: string; count: number }[];
  byRank: { label: string; count: number }[];
  districtRanks: { district: string; counts: ColumnCounts; total: number }[];
  /** Every district / unit with officers (not narrowed by the filters), for the District filter. */
  districtOptions: string[];
}

interface GroupRow {
  police_zone: string | null;
  police_sector_number: string | null;
  police_sector_name: string | null;
  rank: string | null;
  district: string;
  force_category: string | null;
  gender: string | null;
  on_point: boolean;
  printed: boolean;
  n: string;
}

export function dashboardColumnOf(rank?: string | null): DashboardColumn {
  const column = schemeColumnOf(rank);
  if (column) return column;
  return (AR_RANKS as readonly string[]).includes(normalizeRank(rank)) ? 'AR' : 'Others';
}

const addRequirement = (into: RankRequirement, from?: RankRequirement | null) => {
  if (!from) return;
  for (const [column, count] of Object.entries(from)) {
    into[column as keyof RankRequirement] = (into[column as keyof RankRequirement] ?? 0) + (count ?? 0);
  }
};
const hasValues = (requirement: RankRequirement) => Object.values(requirement).some(Boolean);

export async function loadPoliceDashboard(filters: { force?: string; zone?: string; district?: string }): Promise<PoliceDashboard> {
  const params: unknown[] = [];
  const where = ["pass_type = 'POLICE_FORCE'", "status <> 'REVOKED'"];
  if (filters.force) { params.push(filters.force); where.push(`force_category = $${params.length}`); }
  if (filters.zone) { params.push(filters.zone); where.push(`police_zone = $${params.length}`); }
  if (filters.district) { params.push(filters.district.toLowerCase()); where.push(`LOWER(${policeDistrictSql}) = $${params.length}`); }
  const districtList = await query<{ district: string }>(
    `SELECT DISTINCT ${policeDistrictSql} AS district FROM passes WHERE pass_type = 'POLICE_FORCE' AND status <> 'REVOKED' ORDER BY 1`,
  );
  const res = await query<GroupRow>(
    `SELECT NULLIF(BTRIM(police_zone), '') AS police_zone, police_sector_number, police_sector_name, rank,
            ${policeDistrictSql} AS district, force_category, gender,
            NULLIF(BTRIM(police_point_code), '') IS NOT NULL AS on_point,
            (printed_count > 0 OR status IN ('PRINTED', 'ISSUED')) AS printed,
            COUNT(*)::text AS n
       FROM passes
      WHERE ${where.join(' AND ')}
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9`,
    params,
  );

  const totals = { officers: 0, allotted: 0, onPoint: 0, notAllotted: 0, printed: 0 };
  const tally = new Map<string, Map<string, number>>();
  const bump = (bucket: string, key: string, n: number) => {
    const map = tally.get(bucket) ?? new Map<string, number>();
    map.set(key, (map.get(key) ?? 0) + n);
    tally.set(bucket, map);
  };
  // Zone / sector / sub-sector counts keyed "zone|sector|sub".
  const cells = new Map<string, ColumnCounts>();
  const cell = (key: string, column: DashboardColumn, n: number) => {
    const counts = cells.get(key) ?? {};
    counts[column] = (counts[column] ?? 0) + n;
    cells.set(key, counts);
  };
  const districtCells = new Map<string, ColumnCounts>();

  for (const row of res.rows) {
    const n = Number(row.n);
    const column = dashboardColumnOf(row.rank);
    totals.officers += n;
    if (row.police_zone) totals.allotted += n; else totals.notAllotted += n;
    if (row.on_point) totals.onPoint += n;
    if (row.printed) totals.printed += n;
    bump('district', row.district.trim() || 'Unknown', n);
    bump('force', row.force_category ?? 'CIVIL', n);
    bump('gender', row.gender ?? 'MALE', n);
    bump('rank', rankGroupOf(row.rank) || 'Unknown', n);
    const districtCounts = districtCells.get(row.district) ?? {};
    districtCounts[column] = (districtCounts[column] ?? 0) + n;
    districtCells.set(row.district, districtCounts);

    if (row.police_zone) {
      const posting = resolveDutyPosting(row.police_zone, row.police_sector_number, row.police_sector_name);
      cell(row.police_zone, column, n);
      if (row.police_sector_number) {
        cell(`${row.police_zone}|${row.police_sector_number}`, column, n);
        if (posting.subSector) cell(`${row.police_zone}|${row.police_sector_number}|${posting.subSector}`, column, n);
      }
    }
  }

  const sum = (counts: ColumnCounts) => Object.values(counts).reduce((total, value) => total + (value ?? 0), 0);
  const node = (key: string, label: string, required: RankRequirement | null, children: MatrixNode[] = []): MatrixNode => {
    const counts = cells.get(key) ?? {};
    return { key, label, counts, total: sum(counts), required: required && hasValues(required) ? required : null, children };
  };

  const zones = filters.zone ? POLICE_BANDOBUSHT_ZONES.filter(zone => zone.name === filters.zone) : POLICE_BANDOBUSHT_ZONES;
  const matrix = zones.map(zone => {
    const zoneRequired: RankRequirement = {};
    const sectors = zone.sectors.map(sector => {
      const subs = (sector.subSectors ?? []).map(sub =>
        node(`${zone.name}|${sector.number}|${sub}`, sub, schemeRequirement(zone.name, sector.number, sub) ?? null));
      let required = schemeRequirement(zone.name, sector.number) ?? null;
      if (!required && subs.some(sub => sub.required)) {
        required = {};
        subs.forEach(sub => addRequirement(required!, sub.required));
      }
      addRequirement(zoneRequired, required);
      return node(`${zone.name}|${sector.number}`, `${sector.number}: ${sector.name}`, required, subs.filter(sub => sub.total || sub.required));
    });
    return node(zone.name, `Zone ${zone.number}: ${zone.name}`, zoneRequired, sectors);
  });

  const sorted = (bucket: string) => [...(tally.get(bucket) ?? new Map()).entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    totals,
    matrix,
    byDistrict: sorted('district'),
    byForce: sorted('force'),
    byGender: sorted('gender'),
    byRank: sorted('rank'),
    districtRanks: [...districtCells.entries()]
      .map(([district, counts]) => ({ district, counts, total: sum(counts) }))
      .sort((a, b) => b.total - a.total || a.district.localeCompare(b.district)),
    districtOptions: districtList.rows.map(row => row.district.trim()).filter(Boolean),
  };
}
