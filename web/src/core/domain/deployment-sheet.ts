/**
 * Sector-wise deployment list ("Final" sheet format): officers grouped under a heading per
 * Zone / Sector / Sub-sector (duty points are not listed), numbered from 1 inside each group, senior ranks first.
 * Shared by the Excel, CSV and PDF exports. No path aliases (loaded directly by the tests).
 */
import { POLICE_BANDOBUSHT_ZONES } from './police-zones';
import { normalizeRank, rankSeniority } from './ranks';

export interface SheetOfficer {
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  police_station?: string | null;
  mobile_number: string;
  district: string;
  police_zone: string | null;
  police_sector_number: string | null;
  police_sector_name: string | null;
  police_custom_sector?: string | null;
}

export const SECTOR_WISE_COLUMNS = ['S. No.', 'Rank', 'G.No.', 'Name', 'Place of working', 'Mobile No.', 'District'] as const;
export const SECTOR_WISE_TITLE = '61st ALL INDIA DGsP / IGsP CONFERENCE-2026, TIRUPATI.';
export const SECTOR_WISE_SUBTITLE = 'SECTOR WISE FORCE DEPLOYMENT';
export const NOT_ALLOTTED = 'Not allotted to a zone';

export interface SectorWiseBlock {
  /** Heading lines, e.g. ["Zone 2: … | Sector 1: …", "Sub-sector: 1(A) …"]. */
  heading: string[];
  /** Officer rows in SECTOR_WISE_COLUMNS order, numbered from 1. */
  rows: string[][];
}

const BIG = 1_000_000;

export function buildSectorWiseBlocks(officers: SheetOfficer[]): SectorWiseBlock[] {
  const groups = new Map<string, { order: number[]; heading: string[]; officers: SheetOfficer[] }>();

  for (const officer of officers) {
    const zoneName = (officer.police_zone ?? '').trim();
    let order: number[];
    let heading: string[];
    if (!zoneName) {
      order = [BIG, 0, 0];
      heading = [NOT_ALLOTTED];
    } else {
      const zoneIndex = POLICE_BANDOBUSHT_ZONES.findIndex(item => item.name === zoneName);
      const zone = zoneIndex >= 0 ? POLICE_BANDOBUSHT_ZONES[zoneIndex] : undefined;
      const sectorIndex = zone ? zone.sectors.findIndex(item => item.number === officer.police_sector_number) : -1;
      const sector = zone && sectorIndex >= 0 ? zone.sectors[sectorIndex] : undefined;
      const subSectorIndex = sector?.subSectors?.indexOf(officer.police_sector_name ?? '') ?? -1;
      const subSector = subSectorIndex >= 0 ? sector!.subSectors![subSectorIndex] : null;

      const zoneLabel = zone ? `Zone ${zone.number}: ${zone.name}` : zoneName;
      const customName = officer.police_sector_name === 'OTHERS' && officer.police_custom_sector ? officer.police_custom_sector : officer.police_sector_name;
      const sectorLabel = sector ? `${sector.number}: ${sector.name}`
        : officer.police_sector_number ? `${officer.police_sector_number}${customName ? `: ${customName}` : ''}` : 'Sector not assigned';

      order = [
        zone ? zone.number : BIG - 1,
        sector ? sectorIndex : BIG,
        // Officers posted to the sector itself come before its sub-sectors.
        subSector ? subSectorIndex : -1,
      ];
      heading = [`${zoneLabel} | ${sectorLabel}`];
      if (subSector) heading.push(`Sub-sector: ${subSector}`);
    }

    const key = heading.join('\n');
    const group = groups.get(key) ?? { order, heading, officers: [] };
    group.officers.push(officer);
    groups.set(key, group);
  }

  const compareOrder = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };

  return [...groups.values()]
    .sort((a, b) => compareOrder(a.order, b.order) || a.heading.join('\n').localeCompare(b.heading.join('\n')))
    .map(group => ({
      heading: group.heading,
      rows: group.officers
        .slice()
        .sort((a, b) => rankSeniority(a.rank) - rankSeniority(b.rank) || a.full_name.localeCompare(b.full_name))
        .map((officer, index) => [
          String(index + 1),
          normalizeRank(officer.rank),
          officer.police_id_number ?? '',
          officer.full_name,
          officer.police_station ?? '',
          officer.mobile_number ?? '',
          officer.district ?? '',
        ]),
    }));
}

/** IST timestamp for export footers, e.g. "26/11/2026, 14:05 IST". */
export function istTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date) + ' IST';
}
