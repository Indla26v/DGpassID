/**
 * Allotments printed on duty passports: up to 3 officers, in order, per sub-sector (position 1 = Sub-sector Incharge)
 * or, for a sector with no sub-sectors, per sector (position 1 = Sector Incharge, stored with sub_sector = '').
 * A sector with sub-sectors always gets the senior-most officer as Sector Incharge.
 */
import { query, withTransaction } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { SUB_SECTOR_OFFICERS, topRankOfficers, type InchargeAllotment, type SectorOfficer } from '@/core/domain/duty-passport';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { listSectorSeniors } from './passports.repository';

export interface InchargeRecord extends InchargeAllotment {
  pass_id: string;
  position: number;
  police_id_number: string | null;
  /** Where the officer is posted now; differs from the allotment if they were moved after being allotted. */
  posted_zone: string | null;
  posted_sector: string | null;
  posted_sector_name: string | null;
  assigned_by: string;
  assigned_at: string;
}

const fields = `i.zone, NULLIF(i.sector, '') AS sector, NULLIF(i.sub_sector, '') AS sub_sector, i.position, i.pass_id,
  p.full_name, p.rank, p.mobile_number, p.police_id_number,
  p.police_zone AS posted_zone, p.police_sector_number AS posted_sector, p.police_sector_name AS posted_sector_name,
  i.assigned_by, i.assigned_at`;

/** Every allotment, or only those for the given zones. */
export async function listIncharges(zones?: string[]): Promise<InchargeRecord[]> {
  const res = await query<InchargeRecord>(
    `SELECT ${fields} FROM deployment_incharges i JOIN passes p ON p.id = i.pass_id
      ${zones ? 'WHERE i.zone = ANY($1::text[])' : ''} ORDER BY i.zone, i.sector, i.sub_sector, i.position`,
    zones ? [zones] : [],
  );
  return res.rows;
}

/**
 * True while the allotted officer is still posted in the same zone. Officers may be allotted from anywhere in the zone
 * (e.g. a DSP of the zone for a sector that has only constables), so only a move to another zone drops them.
 */
export const stillPosted = (row: InchargeRecord) => row.posted_zone === row.zone;

/** Allotments whose officer is still posted where they were allotted (used on passports). */
export async function currentIncharges(zones: string[]): Promise<InchargeAllotment[]> {
  return (await listIncharges(zones)).filter(stillPosted);
}

export class InchargeError extends Error {}

type Client = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function writeSlot(client: Client, zone: string, sector: string, subSector: string, passIds: string[], actor: SessionUser, how: string) {
  await client.query('DELETE FROM deployment_incharges WHERE zone = $1 AND sector = $2 AND sub_sector = $3', [zone, sector, subSector]);
  for (const [index, passId] of passIds.entries()) {
    await client.query(
      'INSERT INTO deployment_incharges (zone, sector, sub_sector, position, pass_id, assigned_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [zone, sector, subSector, index + 1, passId, actor.email],
    );
  }
  if (passIds.length) {
    const { rows } = await client.query<{ id: string; pass_number: string; full_name: string; rank: string | null; office_id: string | null }>(
      'SELECT id, pass_number, full_name, rank, office_id FROM passes WHERE id = ANY($1::uuid[])', [passIds]);
    const byId = new Map(rows.map(row => [row.id, row]));
    const names = passIds.map(id => byId.get(id)).filter(Boolean).map(row => `${row!.rank ?? ''} ${row!.full_name}`.trim());
    const first = byId.get(passIds[0])!;
    await client.query(
      `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
       VALUES ($1, $2, 'DEPLOYMENT_INCHARGE_ALLOTTED', $3, $4, $5, $6)`,
      [first.id, first.pass_number, actor.email, actor.role,
        `${how} for ${zone} ${sector}${subSector ? ` ${subSector}` : ''}: ${names.join('; ')} (1st is ${subSector ? 'Sub-sector' : 'Sector'} Incharge).`, first.office_id],
    );
  }
}

/**
 * Replaces the officers of a sub-sector (or, with subSector null, of a sector that has no sub-sectors) with passIds
 * (1 to 3, in order), or clears it with an empty list. Officers may be posted anywhere in the same zone.
 */
export async function setSlotOfficers(zone: string, sector: string, subSector: string | null, passIds: string[], actor: SessionUser) {
  if (passIds.length > SUB_SECTOR_OFFICERS || new Set(passIds).size !== passIds.length) {
    throw new InchargeError(`Choose up to ${SUB_SECTOR_OFFICERS} different officers.`);
  }
  return withTransaction(async client => {
    if (passIds.length) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM passes WHERE id = ANY($1::uuid[]) AND pass_type = 'POLICE_FORCE' AND status <> 'REVOKED' AND police_zone = $2`,
        [passIds, zone],
      );
      if (rows.length !== passIds.length) throw new InchargeError('Choose officers posted in this zone.');
    }
    await writeSlot(client, zone, sector, subSector ?? '', passIds, actor, subSector ? 'Sub-sector officers allotted' : 'Sector officers allotted');
    return { saved: passIds.length };
  });
}

/**
 * Fills every sub-sector (and every sector without sub-sectors) that has no allotment yet with the first officer of
 * each of the top 3 ranks posted there (SI and above). Places already allotted are left as they are.
 */
/** Officers of SI rank and above posted in each place ("zone|sector|sub-sector", sub-sector blank for the whole sector). */
export async function seniorCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const officer of await listSectorSeniors(POLICE_BANDOBUSHT_ZONES.map(zone => zone.name))) {
    const sectorKey = `${officer.zone}|${officer.sector}|`;
    counts[sectorKey] = (counts[sectorKey] ?? 0) + 1;
    if (officer.sector_name) {
      const subKey = `${officer.zone}|${officer.sector}|${officer.sector_name}`;
      counts[subKey] = (counts[subKey] ?? 0) + 1;
    }
  }
  return counts;
}

export async function autoAllotSubSectors(actor: SessionUser, zoneName?: string) {
  const zones = POLICE_BANDOBUSHT_ZONES.filter(zone => !zoneName || zone.name === zoneName);
  const [existing, seniors] = await Promise.all([listIncharges(zones.map(zone => zone.name)), listSectorSeniors(zones.map(zone => zone.name))]);
  const taken = new Set(existing.map(row => `${row.zone}|${row.sector}|${row.sub_sector ?? ''}`));
  const plan: { zone: string; sector: string; subSector: string; officers: SectorOfficer[] }[] = [];
  let empty = 0;
  for (const zone of zones) {
    for (const sector of zone.sectors) {
      const places = sector.subSectors?.length ? sector.subSectors : [''];
      for (const subSector of places) {
        if (taken.has(`${zone.name}|${sector.number}|${subSector}`)) continue;
        const officers = topRankOfficers(seniors.filter(item => item.zone === zone.name && item.sector === sector.number
          && (!subSector || item.sector_name === subSector))).slice(0, SUB_SECTOR_OFFICERS);
        if (officers.length) plan.push({ zone: zone.name, sector: sector.number, subSector, officers });
        else empty += 1;
      }
    }
  }
  await withTransaction(async client => {
    for (const item of plan) {
      await writeSlot(client, item.zone, item.sector, item.subSector, item.officers.map(officer => officer.id), actor,
        item.subSector ? 'Sub-sector officers auto-allotted' : 'Sector officers auto-allotted');
    }
  });
  return { filled: plan.length, kept: taken.size, withoutSeniorOfficers: empty };
}
