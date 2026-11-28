/**
 * Duty passport: one page per officer with their posting, the duty instruction for their area and
 * the names of their sector / zone logins. No path aliases (loaded directly by the tests).
 */
import { displayDate, type InstructionTarget } from './duty-instructions';
import { findDutyPoint, resolveDutyPosting } from './police-zones';
import type { PolicePrintScope } from './police-print-scope';
import { normalizeRank, RANK_SENIORITY, rankSeniority } from './ranks';

export interface PassportOfficer {
  id: string;
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  police_zone: string | null;
  police_sector_number: string | null;
  police_sector_name: string | null;
  police_point_code: string | null;
  police_point_name: string | null;
  qr_payload: string | null;
}

export interface PassportDetails {
  duty_from: string | null;
  duty_to: string | null;
  duty_hours: string | null;
  security_plan: string | null;
  place_of_duty: string | null;
  batch?: string | null;
}

export interface ZoneAccount {
  name: string;
  scope: PolicePrintScope[];
}

export const PASSPORT_TITLE = 'DUTY PASSPORT';
export const PASSPORT_CONFERENCE = '61ST ALL INDIA CONFERENCE OF DGS & IGS - TIRUPATI';
export const PASSPORT_LEAD = 'You are drafted for the following Bandobust.';
export const DEFAULT_SIGNATORY_DESIGNATION = ['Superintendent of Police,', 'Tirupati District.'];
export const NOT_ASSIGNED = 'Not Assigned';
export const MAX_PASSPORTS = 1000;

/** "FROM 04-12-2026 - TO 06-12-2026", or "ON 04-12-2026" for one day; blank when no dates are set. */
export function passportPeriodLine(details: PassportDetails): string {
  const from = details.duty_from ? displayDate(details.duty_from) : '';
  const to = details.duty_to && details.duty_to !== details.duty_from ? displayDate(details.duty_to) : '';
  if (!from && !to) return '';
  if (from && !to) return `ON ${from}`;
  return [from ? `FROM ${from}` : '', to ? `TO ${to}` : ''].filter(Boolean).join(' - ');
}

/** The rows of the officer box, label then value. A sub-sector is shown with the deployment point. */
export function passportFields(officer: PassportOfficer, details: PassportDetails): [string, string][] {
  const { zone, sector, subSector } = resolveDutyPosting(officer.police_zone, officer.police_sector_number, officer.police_sector_name);
  const component = zone ? `Zone ${zone.number}: ${zone.name}` : officer.police_zone || NOT_ASSIGNED;
  const sectorName = sector ? `${sector.number} - ${sector.name}`
    : officer.police_sector_number ? [officer.police_sector_number, officer.police_sector_name].filter(Boolean).join(' - ') : NOT_ASSIGNED;
  const point = findDutyPoint(officer.police_point_code)?.name ?? officer.police_point_name?.trim() ?? '';
  const rows: [string, string][] = [
    ['Name of the officer', officer.full_name],
    ['Rank', normalizeRank(officer.rank)],
    ['Gen Number', officer.police_id_number?.trim() || '-'],
    ['Component', component],
    ['Sector Name', sectorName],
    ['Deployment Point', [subSector, point].filter(Boolean).join(' - ') || (sector ? `${sector.number} (sector duty)` : 'Not yet assigned')],
  ];
  return rows;
}

/** An officer allotted as Sector Incharge (sector set) or Component Officer (sector null) for a zone. */
export interface InchargeAllotment {
  pass_id?: string;
  zone: string;
  sector: string | null;
  /** Set for a sub-sector allotment. */
  sub_sector?: string | null;
  /** Order within a sub-sector: 1 = Sub-sector Incharge, then 2 and 3. */
  position?: number;
  full_name: string;
  rank: string | null;
  mobile_number: string | null;
}

/** "CI K. Ramesh (9876543210)" for the passport footer. */
export function inchargeLabel(incharge: Pick<InchargeAllotment, 'full_name' | 'rank' | 'mobile_number'>): string {
  const rank = normalizeRank(incharge.rank);
  const mobile = incharge.mobile_number?.replace(/\s+/g, '') ?? '';
  return `${rank ? `${rank} ` : ''}${incharge.full_name.trim()}${mobile ? ` (${mobile})` : ''}`;
}

/** An officer posted in a sector, used to find the senior officers printed in the passport footer. */
export interface SectorOfficer {
  id: string;
  zone: string;
  sector: string;
  /** police_sector_name: the sub-sector when the officer is posted in one. */
  sector_name?: string | null;
  full_name: string;
  rank: string | null;
  mobile_number: string | null;
}

/** Senior officers are counted down to SI (WSI included); ASI, HC, PC and below are not. */
export const SENIOR_RANK_CAP = 'WSI';
export const TOP_RANKS_SHOWN = 3;
export const isSeniorRank = (rank?: string | null) => rankSeniority(rank) <= RANK_SENIORITY.indexOf(SENIOR_RANK_CAP);

/** Officers allotted per sub-sector: the Sub-sector Incharge and the next two. */
export const SUB_SECTOR_OFFICERS = 3;

/** The first officer (by name) of each rank from SP down to SI, most senior rank first. */
export function topRankOfficers(officers: SectorOfficer[]): SectorOfficer[] {
  const byRank = new Map<string, SectorOfficer>();
  for (const officer of officers.filter(item => isSeniorRank(item.rank))
    .sort((a, b) => rankSeniority(a.rank) - rankSeniority(b.rank) || a.full_name.localeCompare(b.full_name))) {
    const rank = normalizeRank(officer.rank);
    if (!byRank.has(rank)) byRank.set(rank, officer);
  }
  return [...byRank.values()];
}

/**
 * Footer names. Sector Incharge: the officer allotted for this sector, otherwise the first officer of the most
 * senior rank posted in the sector (SI and above), otherwise the sector login names.
 * Top officers: the first officer of each of the next senior ranks in the sector (up to 3), with phone numbers.
 * Component Officer: the officer allotted for the zone, otherwise the whole-zone logins. "Not Assigned" when there is none.
 */
export function passportIncharges(
  officer: Pick<PassportOfficer, 'police_zone' | 'police_sector_number'> & { police_sector_name?: string | null },
  accounts: ZoneAccount[],
  allotments: InchargeAllotment[] = [],
  sectorOfficers: SectorOfficer[] = [],
  localOfficers: InchargeAllotment[] = [],
) {
  const names = (match: (area: PolicePrintScope) => boolean) => {
    const found = [...new Set(accounts.filter(account => account.scope.some(match)).map(account => account.name.trim()).filter(Boolean))];
    return found.length ? found.join(', ') : NOT_ASSIGNED;
  };
  const allotted = (sector: string | null, subSector: string | null = null) => allotments.find(item =>
    item.zone === officer.police_zone && item.sector === sector && (item.sub_sector ?? null) === subSector);
  // Officers chosen by the SP for a sector without sub-sectors, in order (1st = Sector Incharge).
  const sectorChosen = officer.police_sector_number
    ? allotments.filter(item => item.zone === officer.police_zone && item.sector === officer.police_sector_number && !item.sub_sector)
      .sort((a, b) => (a.position ?? 1) - (b.position ?? 1))
    : [];
  const sectorAllotment = sectorChosen[0];
  const zoneAllotment = allotted(null);
  const inSector = officer.police_sector_number
    ? sectorOfficers.filter(item => item.zone === officer.police_zone && item.sector === officer.police_sector_number)
    : [];
  const subSector = resolveDutyPosting(officer.police_zone, officer.police_sector_number, officer.police_sector_name).subSector;
  // Sector Incharge: allotted, otherwise the first officer of the most senior rank in the sector.
  const incharge = sectorAllotment ?? topRankOfficers(inSector)[0];
  const inchargeId = sectorAllotment ? sectorAllotment.pass_id : (incharge as SectorOfficer | undefined)?.id;
  // Officers in a sub-sector: up to 3 officers of that sub-sector, as allotted by the SP (in order), otherwise the
  // first officer of each of the top 3 ranks posted there. The 1st is the Sub-sector Incharge.
  // Officers on the sector itself: the first officer of each next senior rank in the sector.
  type Listed = { id?: string; full_name: string; rank: string | null; mobile_number: string | null };
  let subList: Listed[] = [];
  if (subSector) {
    const chosen = allotments
      .filter(item => item.zone === officer.police_zone && item.sector === officer.police_sector_number && item.sub_sector === subSector)
      .sort((a, b) => (a.position ?? 1) - (b.position ?? 1))
      .map(item => ({ ...item, id: item.pass_id }));
    subList = (chosen.length ? chosen : topRankOfficers(inSector.filter(item => item.sector_name === subSector)))
      .filter(item => !inchargeId || item.id !== inchargeId)
      .slice(0, SUB_SECTOR_OFFICERS);
  }
  const top: Listed[] = subSector ? subList.slice(1)
    : sectorChosen.length ? sectorChosen.slice(1, SUB_SECTOR_OFFICERS)
      // The incharge already stands for their rank, so the lines continue with the next ranks down.
      : topRankOfficers(inSector.filter(item => item.id !== inchargeId && (!incharge || normalizeRank(item.rank) !== normalizeRank(incharge.rank))))
        .slice(0, TOP_RANKS_SHOWN);
  return {
    sectorIncharge: incharge ? inchargeLabel(incharge)
      : officer.police_sector_number ? names(area => area.zone === officer.police_zone && area.sector === officer.police_sector_number)
        : NOT_ASSIGNED,
    /** Null when the officer is not posted in a sub-sector. */
    subSectorIncharge: subSector ? (subList[0] ? inchargeLabel(subList[0]) : NOT_ASSIGNED) : null,
    topOfficers: top.map(item => ({
      rank: normalizeRank(item.rank),
      label: `${item.full_name.trim()}${item.mobile_number?.trim() ? ` (${item.mobile_number.replace(/\s+/g, '')})` : ''}`,
    })),
    /** Contacts printed below the incharges: the sub-sector's own Local Officers, otherwise the sector's. */
    localOfficers: (() => {
      const forPlace = (sub: string | null) => localOfficers.filter(item => item.zone === officer.police_zone
        && item.sector === officer.police_sector_number && (item.sub_sector ?? null) === sub);
      const own = subSector ? forPlace(subSector) : [];
      return (own.length ? own : forPlace(null)).map(inchargeLabel);
    })(),
    componentOfficer: zoneAllotment ? inchargeLabel(zoneAllotment)
      : names(area => area.zone === officer.police_zone && area.sector === null),
  };
}

/**
 * Areas covered by both the instruction's targets and the login's scope ('ALL' for the SP).
 * A whole zone on one side and a sector on the other gives that sector.
 */
export function intersectScopes(targets: InstructionTarget[], scope: PolicePrintScope[] | 'ALL'): InstructionTarget[] {
  if (scope === 'ALL') return dedupeAreas(targets);
  const result: InstructionTarget[] = [];
  for (const target of targets) {
    for (const area of scope) {
      if (area.zone !== target.zone) continue;
      if (target.sector === null) {
        // Whole-zone target: the login's own area.
        result.push(area.subSector ? { zone: area.zone, sector: area.sector, subSector: area.subSector } : { zone: area.zone, sector: area.sector });
      } else if (area.sector === null) {
        result.push(target.subSector ? { zone: target.zone, sector: target.sector, subSector: target.subSector } : { zone: target.zone, sector: target.sector });
      } else if (area.sector === target.sector) {
        // Same sector: the narrower of the two (a sub-sector login only gets its own sub-sector).
        if (!area.subSector) result.push(target.subSector ? { zone: target.zone, sector: target.sector, subSector: target.subSector } : { zone: target.zone, sector: target.sector });
        else if (!target.subSector || target.subSector === area.subSector) result.push({ zone: area.zone, sector: area.sector, subSector: area.subSector });
      }
    }
  }
  return dedupeAreas(result);
}

/** Drops areas already covered by a whole zone or a whole sector, and duplicates. */
function dedupeAreas(areas: InstructionTarget[]): InstructionTarget[] {
  const wholeZones = new Set(areas.filter(area => area.sector === null).map(area => area.zone));
  const wholeSectors = new Set(areas.filter(area => area.sector !== null && !area.subSector).map(area => `${area.zone}|${area.sector}`));
  const seen = new Set<string>();
  return areas.filter(area => {
    if (area.sector !== null && wholeZones.has(area.zone)) return false;
    if (area.subSector && wholeSectors.has(`${area.zone}|${area.sector}`)) return false;
    const key = `${area.zone}\u0000${area.sector ?? ''}\u0000${area.subSector ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The verification token from a duty ID card QR ("PASS-NO|TOKEN|..."), or the scanned text itself. */
export function tokenFromQrPayload(payload: string): string {
  const text = String(payload ?? '').trim();
  const parts = text.split('|');
  return (parts.length > 1 ? parts[1] : text).trim().toUpperCase().slice(0, 128);
}
