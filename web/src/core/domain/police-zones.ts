/**
 * Official Bandobusth Scheme Taxonomy & Domain Helpers
 * 61st All India DGPs / IGPs Conference - 2026
 * Tirupati District Police, Andhra Pradesh
 */

import schemePoints from './bandobast-points.json';

export interface PoliceSectorItem {
  number: string;
  name: string;
  subSectors?: string[];
  allocation?: number;
}

export interface PoliceZoneItem {
  id: string;
  number: number;
  name: string;
  subtitle?: string;
  totalAllocation: number;
  sectors: PoliceSectorItem[];
}

export { POLICE_RANKS } from './ranks';

export const POLICE_BANDOBUSHT_ZONES: PoliceZoneItem[] = [
  {
    id: 'ZONE-1',
    number: 1,
    name: 'International Airport, Renigunta',
    totalAllocation: 175,
    sectors: [
      {
        number: 'Sector 1',
        name: 'International Airport, Renigunta',
        allocation: 175,
      },
    ],
  },
  {
    id: 'ZONE-2',
    number: 2,
    name: 'Venues',
    subtitle: 'IISER and IIT',
    totalAllocation: 476,
    sectors: [
      {
        number: 'Sector 1',
        name: 'IISER and its surroundings',
        subSectors: [
          '1(A) IISER main gate and inside',
          '1(B) IISER inside Parking area',
          '1(C) IISER residential quarters route BB for delegates',
          '1(D) IISER Roof tops',
          '1(E) IISER Surroundings',
          '1(F) Parking Place(ITDC Labour Camp) - Outside IISER towards Jangalapalli',
          '1(G) Pickets at Road side Villages',
        ],
        allocation: 353,
      },
      {
        number: 'Sector 2',
        name: 'IIT, Tirupati',
        allocation: 123,
      },
    ],
  },
  {
    id: 'ZONE-3',
    number: 3,
    name: 'Routes',
    subtitle: 'Airport to IISER',
    totalAllocation: 441,
    sectors: [
      {
        number: 'Sector 1',
        name: 'Route from Airport to IISER',
        subSectors: [
          '1(A) Route BB from Jinkalamitta to Seetharampeta fly over Junction',
          '1(B) Route BB from Culvert Near Seetharampeta fly over Junction to IISER',
          '1(C) Route Mobiles (2 shifts)',
        ],
        allocation: 441,
      },
    ],
  },
  {
    id: 'ZONE-4',
    number: 4,
    name: 'Traffic',
    subtitle: 'Tirupati Traffic Component',
    totalAllocation: 357,
    sectors: [
      { number: 'Sector 1', name: 'Airport to IISER', allocation: 80 },
      { number: 'Sector 2', name: 'Airport to IIT', allocation: 24 },
      { number: 'Sector 3', name: 'IIT To IISER' },
      { number: 'Sector 4', name: 'Airport To Culinary Institute', allocation: 22 },
      { number: 'Sector 5', name: 'Taj Hotel To Airport Junction', allocation: 31 },
      { number: 'Sector 6', name: 'SV University To Taj Hotel', allocation: 21 },
      { number: 'Sector 7', name: 'Manasa Sarovar Hotel To Airport Junction', allocation: 29 },
      { number: 'Sector 8', name: 'Bliss Hotel To Ramanuja Junction To Taj Hotel', allocation: 11 },
      { number: 'Sector 9', name: 'Kapilteertham To Manasa Sarovar', allocation: 16 },
      { number: 'Sector 10', name: 'Tirupati Town Traffic Strengthening', allocation: 86 },
      { number: 'Sector 11', name: 'SV University To Garuda Circle' },
      { number: 'Sector 12', name: 'Garuda Circle To Kapilatheertham' },
      { number: 'Sector 13', name: 'Ramanuja Circle To Sindhu Junction' },
      { number: 'Sector 14', name: 'Annamayya Junction - RC puram Junction' },
      { number: 'Sector 15', name: 'Cherlopalli Junction - Omega Hospital Upparapalli Circle', allocation: 6 },
      { number: 'Sector 16', name: 'Garuda Circle To Sri Venkateswara Agriculture University', allocation: 31 },
    ],
  },
  {
    id: 'ZONE-5',
    number: 5,
    name: 'Accommodations/Stay Places',
    subtitle: 'ICI & SV Alumni Guest Houses, Private Hotels and Homestays',
    totalAllocation: 143,
    sectors: [
      {
        number: 'Sector 1',
        name: 'ICI & SV Alumni Guest Houses',
        allocation: 24,
      },
      {
        number: 'Sector 2',
        name: 'Hotels and Homestays',
        subSectors: [
          'ICI',
          'SVAC',
          'TAAJ',
          'GRAND RIDGE',
          'MARRIOT',
          'REGENTA',
          'LEMON TREE',
          'MARASA SAROVAR',
          'BLISS',
          'FORTUNE KENCES',
          'PAI VAISROY',
          'RAJ PARK',
          'OTHERS',
        ],
        allocation: 119,
      },
    ],
  },
  {
    id: 'ZONE-6',
    number: 6,
    name: 'ICCC, Sub-Controls & Essentials',
    totalAllocation: 506,
    sectors: [
      {
        number: 'Sector 1',
        name: 'IIT-Integrated control room (ICCC) old library',
        allocation: 34,
      },
      {
        number: 'Sector 2',
        name: 'Sub-Controls',
        allocation: 323,
      },
      {
        number: 'Sector 3',
        name: 'Liaison - Essential Service Dept.',
        allocation: 149,
      },
    ],
  },
  {
    id: 'ZONE-7',
    number: 7,
    name: 'Contingency Plan',
    totalAllocation: 460,
    sectors: [
      { number: 'Sector 1', name: 'Contingency route', allocation: 112 },
      { number: 'Sector 2', name: 'Contingency Hospitals', allocation: 33 },
      { number: 'Sector 3', name: 'Safe Houses', allocation: 21 },
      { number: 'Sector 4', name: 'Reserve Force & Tirumala Protocol', allocation: 294 },
    ],
  },
  {
    id: 'ZONE-8',
    number: 8,
    name: 'Security Component',
    totalAllocation: 2824,
    sectors: [
      {
        number: 'Sector 1',
        name: 'AR Component (Convoys, Pilots, Escorts, PSOs)',
        subSectors: [
          'Convoy Officers - Civil component',
          'Liaison officers',
          'Special Party (30 @ 10 each)',
          'APSP (15 Platoons) - (Guard duties)',
          'OCTOPUS Teams (04 Teams) - (QRT)',
          'Greyhounds (06 Units) - (Area Domination)',
          'CPT/APT Teams (10) - SSG/ISW (VIP Security)',
          "1(A) Hon'ble Prime Minister of India",
          "1(B) Hon'ble Central Home Minister",
          "1(C) Hon'ble CM of AP",
          "1(D) Hon'ble National Security Advisor",
          "1(E) Hon'ble Governor of AP",
          "1(F) Hon'ble Dy CM of AP",
          "1(G) Hon'ble IT Minister of AP",
          "1(H) Hon'ble Home Minister of AP",
          '1(I) Other Ministers & Senior Police Officers',
          'AR Force in safari for other security duties',
          'Guards',
          'Safe Houses & Safe Contingency Hospitals',
          'Supervising Officers',
        ],
        allocation: 1801,
      },
      { number: 'Sector 2', name: 'MT Section (Drivers)', allocation: 229 },
      {
        number: 'Sector 3',
        name: 'BD Team Component (ASC/ACC/ROP)',
        subSectors: [
          '3(A) Anti Sabotage checking teams (ASC teams)',
          '3(B) Access Control teams (ACC teams)',
          '3(C) Road Opening party teams (ROP teams)',
        ],
        allocation: 616,
      },
      { number: 'Sector 4', name: 'SDRF (02 Teams) & NDRF (02 Teams)', allocation: 100 },
      { number: 'Sector 5', name: 'SB Spotters', allocation: 78 },
    ],
  },
];

export const SECURITY_COMPONENTS_LIST = [
  'ACT TEAMS',
  'ASC TEAMS',
  'AREA DOMINATION TEAMS',
  'ROAD OPENING PARTY',
  'AR GUARDS',
  'BDDS / QRT',
  'OCTOPUS (QRT)',
  'GREYHOUNDS (AREA DOMINATION)',
  'APSP BATTALION GUARDS',
  'CONVOY / PILOT / ESCORT',
  'OTHERS',
] as const;

/**
 * Cleanly formats the Zone line on the badge:
 * "ZONE: [ZONE NAME]"
 */
export function formatPoliceBadgeZone(zoneName?: string | null): string {
  // An officer not yet allotted shows that plainly instead of a made-up zone.
  if (!zoneName || !zoneName.trim()) {
    return 'ZONE: NOT YET ALLOTTED';
  }
  const clean = zoneName.trim().toUpperCase();
  if (clean.startsWith('ZONE:')) return clean;
  if (clean.startsWith('ZONE -')) return `ZONE: ${clean.replace(/^ZONE\s*-\s*\d*\s*:?\s*/i, '')}`;
  return `ZONE: ${clean}`;
}

/**
 * Returns formatted sector number and sector name for the Permitted Access Zones box
 */
export function formatPoliceSectorAccess(
  sectorNumber?: string | null,
  sectorName?: string | null,
  customSector?: string | null,
  securityComponent?: string | null
): { sectorNumber: string; sectorName: string } {
  // Not yet allotted: no sector number or name to show.
  const sNum = (sectorNumber || '—').trim().toUpperCase();

  let sName = (sectorName || 'NOT YET ALLOTTED').trim().toUpperCase();
  if (sName === 'OTHERS' && customSector && customSector.trim()) {
    sName = customSector.trim().toUpperCase();
  }

  if (securityComponent && securityComponent.trim() && securityComponent.toUpperCase() !== 'NONE') {
    sName = `${sName} / ${securityComponent.trim().toUpperCase()}`;
  }

  return {
    sectorNumber: sNum.startsWith('SECTOR') ? sNum : `SECTOR ${sNum}`,
    sectorName: sName,
  };
}

const normalizeDutyName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const romanDutyNumbers = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII',
];
const dutyNumber = (code: string) => /^\d+$/.test(code)
  ? Number(code)
  : romanDutyNumbers.indexOf(code.toUpperCase()) + 1;

/* ------------------------------------------------------------------ */
/* Duty points (seeded from the zonal bandobast scheme, names only)    */
/* ------------------------------------------------------------------ */

export interface DutyPoint {
  code: string;
  name: string;
  zone: string;
  sectorNumber: string;
  subSector: string | null;
}

let pointIndex: DutyPoint[] | null = null;

const subSectorKey = (sector: PoliceSectorItem, subSector: string) => {
  const letter = subSector.match(/^\d+\(([A-Z])\)/i)?.[1];
  return letter ? letter.toUpperCase() : 'X' + ((sector.subSectors ?? []).indexOf(subSector) + 1);
};

// Points added in the app (custom_duty_points), loaded from the server and appended after the scheme's points.
let customPoints: DutyPoint[] = [];
export function setCustomDutyPoints(points: DutyPoint[]) {
  customPoints = points;
}

/** Every point: the scheme's (stable codes such as Z2-S1-A-03) followed by those added in the app (N-...). */
export function allDutyPoints(): DutyPoint[] {
  return customPoints.length ? [...seededDutyPoints(), ...customPoints] : seededDutyPoints();
}

function seededDutyPoints(): DutyPoint[] {
  if (pointIndex) return pointIndex;
  const points: DutyPoint[] = [];
  for (const entry of schemePoints.points) {
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.id === entry.zone);
    const sector = zone?.sectors.find(item => item.number === entry.sector);
    if (!zone || !sector) continue;
    const subSector = entry.subSector && sector.subSectors?.includes(entry.subSector) ? entry.subSector : null;
    const prefix = `Z${zone.number}-S${sector.number.replace(/\D/g, '')}` + (subSector ? '-' + subSectorKey(sector, subSector) : '');
    entry.points.forEach((name, index) => points.push({
      code: `${prefix}-${String(index + 1).padStart(2, '0')}`,
      name,
      zone: zone.name,
      sectorNumber: sector.number,
      subSector,
    }));
  }
  pointIndex = points;
  return points;
}

/** Points for a sector, optionally narrowed to one sub-sector. */
export function dutyPointsFor(zoneName?: string | null, sectorNumber?: string | null, subSector?: string | null): DutyPoint[] {
  if (!zoneName || !sectorNumber) return [];
  return allDutyPoints().filter(point => point.zone === zoneName && point.sectorNumber === sectorNumber &&
    (subSector === undefined || point.subSector === (subSector || null)));
}

export function findDutyPoint(code?: string | null): DutyPoint | undefined {
  return code ? allDutyPoints().find(point => point.code === code) : undefined;
}

/**
 * Splits the stored posting into zone, sector and sub-sector.
 * police_sector_name holds the sub-sector when one was chosen, otherwise the sector name.
 */
export function resolveDutyPosting(zoneName?: string | null, sectorNumber?: string | null, sectorName?: string | null) {
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
  const sector = zone?.sectors.find(item => item.number === sectorNumber);
  const subSector = sector?.subSectors?.find(item => item === sectorName) ?? null;
  return { zone, sector, subSector };
}

/* ------------------------------------------------------------------ */
/* Lenient duty parsing for personnel import                              */
/* ------------------------------------------------------------------ */

export interface ParsedDutyAssignment {
  /** Non-blocking note: the officer still imports, with duty kept down to the last level that matched. */
  dutyWarning: string;
  police_zone: string;
  police_sector_number: string;
  police_sector_name: string;
  police_point_code: string;
  police_point_name: string;
}

const findSubSector = (sector: PoliceSectorItem, value: string) => {
  const subs = sector.subSectors ?? [];
  const wanted = normalizeDutyName(value);
  if (!wanted) return undefined;
  const byName = subs.find(name => normalizeDutyName(name) === wanted ||
    normalizeDutyName(name.replace(/^\d+\(\w\)\s*/, '')) === wanted);
  if (byName) return byName;
  const code = value.match(/^(?:(\d+)\s*)?\(?([a-z])\)?(?:\s*[:–—-]\s*.*)?$/i);
  if (code && (!code[1] || 'Sector ' + code[1] === sector.number)) {
    return subs.find(name => new RegExp(`^\\d+\\(${code[2]}\\)`, 'i').test(name));
  }
  return undefined;
};

/**
 * Resolves zone → sector → sub-sector → point from imported cells as deeply as they allow.
 * Blank cells are fine (no duty). Unrecognised cells never block the row: they are dropped
 * and reported in dutyWarning.
 */
export function parsePoliceDutyAssignment(
  zoneValue: string,
  sectorValue: string,
  sectorNameValue: string,
  subSectorValue = '',
  pointValue = '',
): ParsedDutyAssignment {
  const result: ParsedDutyAssignment = {
    dutyWarning: '', police_zone: '', police_sector_number: '', police_sector_name: '', police_point_code: '', police_point_name: '',
  };
  const values = [zoneValue, sectorValue, sectorNameValue, subSectorValue, pointValue].map(value => value.trim());
  [zoneValue, sectorValue, sectorNameValue, subSectorValue, pointValue] = values;
  if (!values.some(Boolean)) return result;

  const zoneCode = zoneValue.match(/^(?:zone[\s-]*(?:(?:no\.?|number|#)[\s.:-]*)?)?(\d+|[ivx]+)(?:\s*[:–—-]\s*(.+))?$/i);
  const zone = zoneCode
    ? POLICE_BANDOBUSHT_ZONES.find(item => item.number === dutyNumber(zoneCode[1]))
    : POLICE_BANDOBUSHT_ZONES.find(item => normalizeDutyName(item.name) === normalizeDutyName(zoneValue) ||
      normalizeDutyName(item.id) === normalizeDutyName(zoneValue));
  if (!zone) {
    result.dutyWarning = zoneValue
      ? `Zone "${zoneValue}" is not in the bandobast scheme. Imported without a duty posting.`
      : 'A sector was given without a zone. Imported without a duty posting.';
    return result;
  }
  result.police_zone = zone.name;
  const warnings: string[] = [];
  if (zoneCode?.[2] && normalizeDutyName(zoneCode[2]) !== normalizeDutyName(zone.name)) {
    warnings.push(`Zone name "${zoneCode[2]}" differs from Zone ${zone.number}: ${zone.name}; the zone number was used.`);
  }

  // Sector: by number ("1", "I", "Sector-1", "Sector 1(A)") or by sector / sub-sector name.
  const sectorCode = sectorValue.match(/^(?:sector[\s-]*(?:(?:no\.?|number|#)[\s.:-]*)?)?(\d+|[ivx]+)\s*(?:\(([a-z])\)|-?\s*([a-z])(?=\s*(?:[:–—-]|$)))?(?:\s*[:–—-]\s*(.+))?$/i);
  const nameCandidates = [sectorNameValue, sectorCode ? sectorCode[4] ?? '' : sectorValue].filter(Boolean);
  let sector = sectorCode ? zone.sectors.find(item => item.number === 'Sector ' + dutyNumber(sectorCode[1])) : undefined;
  if (!sector && nameCandidates.length) {
    sector = zone.sectors.find(item => nameCandidates.some(value =>
      normalizeDutyName(item.name) === normalizeDutyName(value) || Boolean(findSubSector(item, value))));
  }
  if (!sector) {
    if (sectorValue || sectorNameValue || subSectorValue || pointValue) {
      warnings.push(`Sector "${sectorValue || sectorNameValue || subSectorValue}" is not in Zone ${zone.number}. Imported with the zone only.`);
    }
    result.dutyWarning = warnings.join(' ');
    return result;
  }
  result.police_sector_number = sector.number;
  result.police_sector_name = sector.name;

  // Sub-sector: explicit column, the letter in "1(A)", or a sector-name cell that names a sub-sector.
  const letter = sectorCode?.[2] || sectorCode?.[3];
  const subCandidates = [subSectorValue, letter ? `${dutyNumber(sectorCode![1])}(${letter})` : '', ...nameCandidates].filter(Boolean);
  let subSector: string | undefined;
  for (const value of subCandidates) {
    subSector = findSubSector(sector, value);
    if (subSector) break;
  }
  if (subSector) {
    result.police_sector_name = subSector;
  } else if (subSectorValue || letter) {
    warnings.push(`Sub-sector "${subSectorValue || letter}" is not under ${sector.number}. Imported with the sector only.`);
  } else if (sectorNameValue && normalizeDutyName(sectorNameValue) !== normalizeDutyName(sector.name)) {
    if (sector.subSectors?.includes('OTHERS')) {
      result.police_sector_name = 'OTHERS';
    } else {
      warnings.push(`Sector name "${sectorNameValue}" does not match ${sector.number}: ${sector.name}; the sector number was used.`);
    }
  }

  // Point: by name, by serial number within the sub-sector/sector, or by point code.
  if (pointValue) {
    const scoped = dutyPointsFor(zone.name, sector.number, subSector ?? undefined);
    const wanted = normalizeDutyName(pointValue);
    const serial = pointValue.match(/^(?:p(?:oint)?\s*)?(\d{1,3})$/i)?.[1];
    const point = findDutyPoint(pointValue.toUpperCase())
      ?? scoped.find(item => normalizeDutyName(item.name) === wanted)
      ?? (serial && (subSector || !sector.subSectors?.length) ? scoped[Number(serial) - 1] : undefined);
    if (point && point.zone === zone.name && point.sectorNumber === sector.number) {
      result.police_point_code = point.code;
      result.police_point_name = point.name;
      if (point.subSector) result.police_sector_name = point.subSector;
    } else {
      warnings.push(`Point "${pointValue}" is not in this sector. Imported without a point.`);
    }
  }

  result.dutyWarning = warnings.join(' ');
  return result;
}
