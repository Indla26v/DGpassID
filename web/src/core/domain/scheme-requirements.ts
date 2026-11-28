/**
 * Rank-wise strength required per sector (and some sub-sectors), transcribed from the
 * zone abstracts of the DGPs/IGPs Conference 2026 Zonal BB scheme (zones 1-7: Phase-I scheme, IISER conference all-zones sheet; zone 8: draft 26-11-2026).
 * Columns follow the scheme: SP, Addl. SP, DSP, CI, SI, ASI/HC, PC, WPC, HG.
 */
import { POLICE_BANDOBUSHT_ZONES } from './police-zones';
import { rankGroupOf } from './ranks';

export const SCHEME_RANK_COLUMNS = ['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI/HC', 'PC', 'WPC', 'HG'] as const;
export type SchemeRankColumn = (typeof SCHEME_RANK_COLUMNS)[number];
export type RankRequirement = Partial<Record<SchemeRankColumn, number>>;

type Key = string; // `${zoneId}|${sectorNumber}` or `${zoneId}|${sectorNumber}|${subSector}`

const R = (sp: number, asp: number, dsp: number, ci: number, si: number, asiHc: number, pc: number, wpc = 0, hg = 0): RankRequirement => {
  const values: RankRequirement = { SP: sp, 'Addl. SP': asp, DSP: dsp, CI: ci, SI: si, 'ASI/HC': asiHc, PC: pc, WPC: wpc, HG: hg };
  return Object.fromEntries(Object.entries(values).filter(([, count]) => count)) as RankRequirement;
};

export const SCHEME_REQUIREMENTS: Record<Key, RankRequirement> = {
  // Zone 1 — International Airport, Renigunta (175)
  'ZONE-1|Sector 1': R(1, 1, 4, 8, 12, 33, 112, 4),

  // Zone 2 — Venues: IISER and IIT (476)
  'ZONE-2|Sector 1': R(1, 2, 11, 14, 42, 52, 231),
  'ZONE-2|Sector 1|1(A) IISER main gate and inside': R(1, 2, 4, 4, 4, 8, 24),
  'ZONE-2|Sector 1|1(B) IISER inside Parking area': R(0, 0, 2, 2, 4, 16, 32),
  'ZONE-2|Sector 1|1(C) IISER residential quarters route BB for delegates': R(0, 0, 2, 2, 6, 6, 50),
  'ZONE-2|Sector 1|1(D) IISER Roof tops': R(0, 0, 0, 0, 2, 0, 24),
  'ZONE-2|Sector 1|1(E) IISER Surroundings': R(0, 0, 2, 2, 12, 14, 45),
  'ZONE-2|Sector 1|1(F) Parking Place(ITDC Labour Camp) - Outside IISER towards Jangalapalli': R(0, 0, 1, 2, 4, 8, 36),
  'ZONE-2|Sector 1|1(G) Pickets at Road side Villages': R(0, 0, 0, 2, 10, 0, 20),
  'ZONE-2|Sector 2': R(0, 1, 2, 6, 14, 18, 82),

  // Zone 3 — Routes: Airport to IISER (441)
  'ZONE-3|Sector 1': R(1, 2, 6, 20, 39, 72, 301),
  'ZONE-3|Sector 1|1(A) Route BB from Jinkalamitta to Seetharampeta fly over Junction': R(1, 1, 2, 4, 8, 11, 111),
  'ZONE-3|Sector 1|1(B) Route BB from Culvert Near Seetharampeta fly over Junction to IISER': R(0, 1, 4, 12, 22, 25, 182),
  'ZONE-3|Sector 1|1(C) Route Mobiles (2 shifts)': R(0, 0, 0, 4, 9, 36, 8),

  // Zone 4 — Traffic: Tirupati (357). Sectors 3 and 11–14 are covered by Sectors 1 and 10 in the scheme.
  'ZONE-4|Sector 1': R(0, 0, 1, 5, 8, 12, 54),
  'ZONE-4|Sector 2': R(0, 0, 0, 2, 2, 0, 20),
  'ZONE-4|Sector 4': R(0, 0, 0, 1, 1, 4, 16),
  'ZONE-4|Sector 5': R(0, 0, 0, 1, 2, 10, 18),
  'ZONE-4|Sector 6': R(0, 0, 0, 2, 4, 8, 7),
  'ZONE-4|Sector 7': R(0, 0, 0, 4, 5, 6, 14),
  'ZONE-4|Sector 8': R(0, 0, 0, 1, 1, 4, 5),
  'ZONE-4|Sector 9': R(0, 0, 0, 1, 2, 4, 9),
  'ZONE-4|Sector 10': R(0, 0, 0, 4, 8, 29, 45),
  'ZONE-4|Sector 15': R(0, 0, 0, 0, 1, 2, 3),
  'ZONE-4|Sector 16': R(0, 0, 0, 2, 6, 6, 17),

  // Zone 5 — Accommodations (143)
  'ZONE-5|Sector 1': R(0, 0, 0, 4, 4, 4, 12),
  'ZONE-5|Sector 2': R(0, 0, 0, 6, 17, 26, 70),

  // Zone 6 — ICCC, Sub-Controls & Essentials (506)
  'ZONE-6|Sector 1': R(2, 0, 2, 2, 4, 10, 10, 4),
  'ZONE-6|Sector 2': R(0, 5, 14, 34, 54, 60, 138, 18),
  'ZONE-6|Sector 3': R(0, 0, 1, 10, 16, 12, 110),

  // Zone 7 — Contingency Plan (460)
  'ZONE-7|Sector 1': R(0, 0, 1, 2, 4, 29, 76),
  'ZONE-7|Sector 2': R(0, 0, 0, 0, 11, 11, 11),
  'ZONE-7|Sector 3': R(0, 0, 0, 0, 7, 7, 7),
  'ZONE-7|Sector 4': R(4, 8, 12, 10, 5, 83, 142, 30),

  // Zone 8 — Security Component (2824; abstract uses the civil column names for the AR component).
  // Sector 1 (1801) = AR component, convoy officers, liaison, special party, APSP, OCTOPUS, Greyhounds, CPT/APT.
  'ZONE-8|Sector 1': R(0, 7, 27, 134, 234, 147, 1252),
  'ZONE-8|Sector 1|Liaison officers': R(0, 0, 0, 73, 95, 82, 0),
  'ZONE-8|Sector 2': R(0, 0, 0, 0, 0, 0, 229),
  'ZONE-8|Sector 3': R(0, 0, 0, 0, 0, 0, 516, 100),
  // SDRF (SI 2, PC 38) + NDRF (CI 2, ASI/HC 14, PC 44)
  'ZONE-8|Sector 4': R(0, 0, 0, 2, 2, 14, 82),
  'ZONE-8|Sector 5': R(0, 0, 0, 0, 0, 0, 78),
};

const keyFor = (zoneName: string, sectorNumber: string, subSector?: string | null) => {
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
  return zone ? [zone.id, sectorNumber, ...(subSector ? [subSector] : [])].join('|') : '';
};

/** Rank-wise requirement for a sector or sub-sector, if the scheme gives one. */
export function schemeRequirement(zoneName: string, sectorNumber: string, subSector?: string | null): RankRequirement | undefined {
  return SCHEME_REQUIREMENTS[keyFor(zoneName, sectorNumber, subSector)];
}

export function requirementTotal(requirement: RankRequirement): number {
  return Object.values(requirement).reduce((sum, count) => sum + (count ?? 0), 0);
}

/** Scheme column a rank or rank group counts against (AR component ranks have no civil column). */
export function schemeColumnOf(rankOrGroup?: string | null): SchemeRankColumn | null {
  const group = rankGroupOf(rankOrGroup) || (rankOrGroup ?? '');
  return (SCHEME_RANK_COLUMNS as readonly string[]).includes(group) ? group as SchemeRankColumn : null;
}
