/**
 * Duty points added in the app (custom_duty_points), on top of the points seeded from the bandobast scheme.
 */
import { query, withTransaction } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { POLICE_BANDOBUSHT_ZONES, setCustomDutyPoints, type DutyPoint } from '@/core/domain/police-zones';

export class CustomPointError extends Error {}

interface Row { code: string; zone: string; sector: string; sub_sector: string; name: string }
const toPoint = (row: Row): DutyPoint => ({ code: row.code, name: row.name, zone: row.zone, sectorNumber: row.sector, subSector: row.sub_sector || null });

/** All added points, in the order they were added. Also makes them known to dutyPointsFor / findDutyPoint here. */
export async function loadCustomDutyPoints(): Promise<DutyPoint[]> {
  const res = await query<Row>('SELECT code, zone, sector, sub_sector, name FROM custom_duty_points ORDER BY created_at, code');
  const points = res.rows.map(toPoint);
  setCustomDutyPoints(points);
  return points;
}

/** Adds a point to a sector (subSector null) or one of its sub-sectors. Codes look like N-Z2-S1-A-001. */
export async function addCustomDutyPoint(zone: string, sector: string, subSector: string | null, name: string, actor: SessionUser): Promise<DutyPoint> {
  const zoneItem = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zone)!;
  const sectorItem = zoneItem.sectors.find(item => item.number === sector)!;
  const letter = subSector ? subSector.match(/^\d+\(([A-Z])\)/i)?.[1]?.toUpperCase() ?? `X${(sectorItem.subSectors ?? []).indexOf(subSector) + 1}` : '';
  const prefix = `N-Z${zoneItem.number}-S${sector.replace(/\D/g, '')}${letter ? `-${letter}` : ''}`;
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(6102031)');
    const taken = await client.query<{ n: number }>(
      `SELECT 1 AS n FROM custom_duty_points WHERE zone = $1 AND sector = $2 AND sub_sector = $3 AND LOWER(BTRIM(name)) = LOWER(BTRIM($4))`,
      [zone, sector, subSector ?? '', name]);
    if (taken.rows.length) throw new CustomPointError('A point with this name already exists here.');
    const { rows } = await client.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM custom_duty_points WHERE code LIKE $1', [`${prefix}-%`]);
    const code = `${prefix}-${String(rows[0].n + 1).padStart(3, '0')}`;
    const inserted = await client.query<Row>(
      `INSERT INTO custom_duty_points (code, zone, sector, sub_sector, name, created_by) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING code, zone, sector, sub_sector, name`,
      [code, zone, sector, subSector ?? '', name, actor.email]);
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, user_role, details) VALUES ('DUTY_POINT_ADDED', $1, $2, $3)`,
      [actor.email, actor.role, `Duty point "${name}" (${code}) added to ${zone} ${sector}${subSector ? ` ${subSector}` : ''}.`]);
    return toPoint(inserted.rows[0]);
  });
}

/** Removes an added point when no officer is posted on it. */
export async function deleteCustomDutyPoint(code: string, actor: SessionUser): Promise<void> {
  return withTransaction(async client => {
    const point = await client.query<Row>('SELECT code, zone, sector, sub_sector, name FROM custom_duty_points WHERE code = $1', [code]);
    if (!point.rows.length) throw new CustomPointError('This duty point was not found.');
    const used = await client.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM passes WHERE pass_type = 'POLICE_FORCE' AND police_point_code = $1", [code]);
    if (used.rows[0].n) throw new CustomPointError(`${used.rows[0].n} officer(s) are posted on this point. Move them first.`);
    await client.query('DELETE FROM custom_duty_points WHERE code = $1', [code]);
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, user_role, details) VALUES ('DUTY_POINT_REMOVED', $1, $2, $3)`,
      [actor.email, actor.role, `Duty point "${point.rows[0].name}" (${code}) removed.`]);
  });
}
