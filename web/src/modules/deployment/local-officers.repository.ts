/**
 * Local Officers: a contact per sector (sub_sector '') or sub-sector, printed on duty passports below the incharges.
 * Any officer in the personnel directory may be attached, from any zone. A place may have several Local Officers
 * (printed in the order attached), and one officer may cover many places.
 */
import { query, withTransaction } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { InchargeAllotment } from '@/core/domain/duty-passport';
import { rankSeniority } from '@/core/domain/ranks';

export interface LocalOfficerRecord extends InchargeAllotment {
  pass_id: string;
  sector: string;
  police_id_number: string | null;
  /** Where the officer is posted (may be another zone, or none). */
  posted_zone: string | null;
  posted_sector: string | null;
  assigned_by: string;
  assigned_at: string;
}

export interface DirectoryOfficer {
  id: string;
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  mobile_number: string | null;
  district: string | null;
  police_zone: string | null;
  police_sector_number: string | null;
}

export class LocalOfficerError extends Error {}

/** Most Local Officers one sector or sub-sector can have. */
export const MAX_LOCAL_OFFICERS = 6;

/** Every Local Officer, or only those for the given zones. */
export async function listLocalOfficers(zones?: string[]): Promise<LocalOfficerRecord[]> {
  const res = await query<LocalOfficerRecord>(
    `SELECT l.zone, l.sector, NULLIF(l.sub_sector, '') AS sub_sector, l.pass_id,
            p.full_name, p.rank, p.mobile_number, p.police_id_number,
            p.police_zone AS posted_zone, p.police_sector_number AS posted_sector, l.assigned_by, l.assigned_at
       FROM deployment_local_officers l JOIN passes p ON p.id = l.pass_id
      WHERE p.status <> 'REVOKED' ${zones ? 'AND l.zone = ANY($1::text[])' : ''}
      ORDER BY l.zone, l.sector, l.sub_sector, l.assigned_at, p.full_name`,
    zones ? [zones] : [],
  );
  return res.rows;
}

/** Officers in the whole personnel directory matching a name, G.No. or mobile, most senior first. */
export async function searchDirectory(term: string, limit = 40): Promise<DirectoryOfficer[]> {
  const like = `%${term.replace(/[\\%_]/g, match => `\\${match}`)}%`;
  const res = await query<DirectoryOfficer>(
    `SELECT id, full_name, rank, police_id_number, mobile_number,
            COALESCE(NULLIF(BTRIM(police_unit_district), ''), NULLIF(BTRIM(institution_other), '')) AS district,
            police_zone, police_sector_number
       FROM passes
      WHERE pass_type = 'POLICE_FORCE' AND status <> 'REVOKED'
        AND (full_name ILIKE $1 OR police_id_number ILIKE $1 OR mobile_number ILIKE $1)
      LIMIT 400`,
    [like],
  );
  return res.rows
    .sort((a, b) => rankSeniority(a.rank) - rankSeniority(b.rank) || a.full_name.localeCompare(b.full_name))
    .slice(0, limit);
}

/** Attaches (add) or detaches (remove) one Local Officer at a sector (subSector null) or sub-sector. */
export async function changeLocalOfficer(action: 'add' | 'remove', zone: string, sector: string, subSector: string | null, passId: string, actor: SessionUser) {
  return withTransaction(async client => {
    const { rows } = await client.query<{ id: string; pass_number: string; full_name: string; rank: string | null; office_id: string | null }>(
      `SELECT id, pass_number, full_name, rank, office_id FROM passes WHERE id = $1 AND pass_type = 'POLICE_FORCE'`,
      [passId],
    );
    const officer = rows[0];
    if (!officer) throw new LocalOfficerError('Choose an officer from the personnel directory.');
    const place = [zone, sector, subSector ?? ''];
    if (action === 'add') {
      const { rows: count } = await client.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM deployment_local_officers WHERE zone = $1 AND sector = $2 AND sub_sector = $3', place);
      if (count[0].n >= MAX_LOCAL_OFFICERS) throw new LocalOfficerError(`A place can have at most ${MAX_LOCAL_OFFICERS} Local Officers.`);
      const inserted = await client.query(
        `INSERT INTO deployment_local_officers (zone, sector, sub_sector, pass_id, assigned_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [...place, officer.id, actor.email],
      );
      if (!inserted.rowCount) throw new LocalOfficerError('This officer is already a Local Officer here.');
    } else {
      await client.query(
        'DELETE FROM deployment_local_officers WHERE zone = $1 AND sector = $2 AND sub_sector = $3 AND pass_id = $4', [...place, officer.id]);
    }
    const where = `${zone} ${sector}${subSector ? ` ${subSector}` : ''}`;
    const name = `${officer.rank ?? ''} ${officer.full_name}`.trim();
    await client.query(
      `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [officer.id, officer.pass_number, action === 'add' ? 'LOCAL_OFFICER_ATTACHED' : 'LOCAL_OFFICER_REMOVED', actor.email, actor.role,
        action === 'add' ? `Local Officer added for ${where}: ${name}.` : `Local Officer removed for ${where}: ${name}.`, officer.office_id],
    );
    return { saved: action === 'add' ? 1 : 0 };
  });
}
