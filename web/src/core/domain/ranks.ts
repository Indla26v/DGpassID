/**
 * Police ranks for the bandobast roster.
 * ASI, WASI, HC and WHC are stored individually (selection ratios need them)
 * but are shown and filtered together as "ASI/HC".
 */

export const CIVIL_RANKS = ['PC', 'WPC', 'HG', 'HC', 'WHC', 'ASI', 'WASI', 'SI', 'CI', 'DSP', 'Addl. SP', 'SP'] as const;
export const AR_RANKS = ['ARPC', 'ARHC', 'ARSI', 'RSI', 'RI'] as const;
export const POLICE_RANKS = [...CIVIL_RANKS, ...AR_RANKS] as const;
export type PoliceRank = (typeof POLICE_RANKS)[number];

export const ASI_HC_GROUP = 'ASI/HC';
export const ASI_HC_RANKS = ['ASI', 'WASI', 'HC', 'WHC'] as const;

/** Rank groups offered in filters and in SP selection, in display order. */
export const RANK_GROUPS: { group: string; ranks: readonly string[]; component: 'CIVIL' | 'AR' }[] = [
  { group: 'PC', ranks: ['PC'], component: 'CIVIL' },
  { group: 'WPC', ranks: ['WPC'], component: 'CIVIL' },
  { group: 'HG', ranks: ['HG'], component: 'CIVIL' },
  { group: ASI_HC_GROUP, ranks: ASI_HC_RANKS, component: 'CIVIL' },
  { group: 'SI', ranks: ['SI'], component: 'CIVIL' },
  { group: 'CI', ranks: ['CI'], component: 'CIVIL' },
  { group: 'DSP', ranks: ['DSP'], component: 'CIVIL' },
  { group: 'Addl. SP', ranks: ['Addl. SP'], component: 'CIVIL' },
  { group: 'SP', ranks: ['SP'], component: 'CIVIL' },
  { group: 'ARPC', ranks: ['ARPC'], component: 'AR' },
  { group: 'ARHC', ranks: ['ARHC'], component: 'AR' },
  { group: 'ARSI', ranks: ['ARSI'], component: 'AR' },
  { group: 'RSI', ranks: ['RSI'], component: 'AR' },
  { group: 'RI', ranks: ['RI'], component: 'AR' },
];

const compact = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, '');

const RANK_ALIASES: Record<string, PoliceRank> = {
  PC: 'PC', CONSTABLE: 'PC', POLICECONSTABLE: 'PC', CIVILPC: 'PC',
  WPC: 'WPC', WOMANPC: 'WPC', WOMENPC: 'WPC', WOMANCONSTABLE: 'WPC', WOMENCONSTABLE: 'WPC', LPC: 'WPC',
  HG: 'HG', HOMEGUARD: 'HG', HOMEGUARDS: 'HG',
  HC: 'HC', HEADCONSTABLE: 'HC', CIVILHC: 'HC',
  WHC: 'WHC', WOMANHC: 'WHC', WOMENHC: 'WHC', WOMANHEADCONSTABLE: 'WHC', WOMENHEADCONSTABLE: 'WHC', LHC: 'WHC',
  ASI: 'ASI', ASSISTANTSUBINSPECTOR: 'ASI', ASSTSUBINSPECTOR: 'ASI',
  WASI: 'WASI', WOMANASI: 'WASI', WOMENASI: 'WASI', WOMANASSISTANTSUBINSPECTOR: 'WASI', LASI: 'WASI',
  SI: 'SI', SUBINSPECTOR: 'SI', SIOFPOLICE: 'SI',
  CI: 'CI', CIRCLEINSPECTOR: 'CI', INSPECTOR: 'CI', INSPECTOROFPOLICE: 'CI',
  DSP: 'DSP', DYSP: 'DSP', DEPUTYSUPERINTENDENTOFPOLICE: 'DSP',
  ADDLSP: 'Addl. SP', ASP: 'Addl. SP', ADDITIONALSP: 'Addl. SP', ADDLSUPERINTENDENTOFPOLICE: 'Addl. SP',
  SP: 'SP', SUPERINTENDENTOFPOLICE: 'SP',
  ARPC: 'ARPC', ARCONSTABLE: 'ARPC', ARMEDRESERVEPC: 'ARPC', ARMEDRESERVECONSTABLE: 'ARPC',
  ARHC: 'ARHC', ARHEADCONSTABLE: 'ARHC', ARMEDRESERVEHC: 'ARHC', ARMEDRESERVEHEADCONSTABLE: 'ARHC',
  ARSI: 'ARSI', ASSISTANTRESERVESUBINSPECTOR: 'ARSI', ASSTRESERVESUBINSPECTOR: 'ARSI',
  RSI: 'RSI', RESERVESUBINSPECTOR: 'RSI',
  RI: 'RI', RESERVEINSPECTOR: 'RI',
};

/** Maps a free-text rank from a roster or form to a canonical rank. Unknown ranks are kept upper-cased. */
export function normalizeRank(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return RANK_ALIASES[compact(value)] ?? value.toUpperCase();
}

export function rankGroupOf(rank?: string | null): string {
  const canonical = normalizeRank(rank);
  return RANK_GROUPS.find(item => item.ranks.includes(canonical))?.group ?? canonical;
}

/** Rank text for cards, tables and filters: ASI, WASI, HC and WHC all display as "ASI/HC". */
export function displayRank(rank?: string | null): string {
  const canonical = normalizeRank(rank);
  return (ASI_HC_RANKS as readonly string[]).includes(canonical) ? ASI_HC_GROUP : canonical;
}

/** Ranks covered by a filter value (a group name or a single rank). */
export function ranksInGroup(groupOrRank: string): string[] {
  const group = RANK_GROUPS.find(item => item.group === groupOrRank);
  return group ? [...group.ranks] : [normalizeRank(groupOrRank)];
}

export function isArRank(rank?: string | null): boolean {
  return (AR_RANKS as readonly string[]).includes(normalizeRank(rank));
}


/** Force categories recorded on import and offered in filters. */
export const FORCE_CATEGORIES = ['CIVIL', 'AR', 'STF', 'OTHERS'] as const;
export type ForceCategory = (typeof FORCE_CATEGORIES)[number];
export const FORCE_LABELS: Record<ForceCategory, string> = { CIVIL: 'Civil', AR: 'AR', STF: 'STF', OTHERS: 'Others' };

export function isForceCategory(value: unknown): value is ForceCategory {
  return typeof value === 'string' && (FORCE_CATEGORIES as readonly string[]).includes(value);
}

/** Maps a roster "Force" value to a category. Blank values are derived from the rank (AR ranks = AR). */
export function normalizeForce(raw?: string | null, rank?: string | null): ForceCategory {
  const value = compact(raw ?? '');
  if (!value) return isArRank(rank) ? 'AR' : 'CIVIL';
  if (['CIVIL', 'CIVILPOLICE', 'LO', 'LAWANDORDER', 'LANDO', 'CVL'].includes(value)) return 'CIVIL';
  if (['AR', 'ARMEDRESERVE', 'ARMEDRESERVEPOLICE', 'ARPOLICE'].includes(value)) return 'AR';
  if (['STF', 'SPECIALTASKFORCE'].includes(value)) return 'STF';
  return 'OTHERS';
}

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

/** True for women's ranks: WPC, WHC, WASI, WSI. */
export function isWomenRank(rank?: string | null): boolean {
  return /^W(PC|HC|ASI|SI)$/.test(normalizeRank(rank));
}

/** Maps a roster gender value. Blank values are derived from the rank (W-ranks = Female, others = Male). */
export function normalizeGender(raw?: string | null, rank?: string | null): Gender {
  const value = compact(raw ?? '');
  if (!value) return isWomenRank(rank) ? 'FEMALE' : 'MALE';
  if (['M', 'MALE', 'MAN', 'GENTS'].includes(value)) return 'MALE';
  if (['F', 'FEMALE', 'WOMAN', 'WOMEN', 'LADY', 'LADIES'].includes(value)) return 'FEMALE';
  return 'OTHER';
}

/** Ranks from senior to junior, used to order lists and exports. */
export const RANK_SENIORITY = ['SP', 'Addl. SP', 'DSP', 'RI', 'CI', 'RSI', 'SI', 'WSI', 'ARSI', 'ASI', 'WASI', 'HC', 'WHC', 'ARHC', 'PC', 'WPC', 'ARPC', 'HG'];

/** Seniority index of a rank (0 = most senior); unknown ranks sort last. */
export function rankSeniority(rank?: string | null): number {
  const index = RANK_SENIORITY.indexOf(normalizeRank(rank));
  return index === -1 ? RANK_SENIORITY.length : index;
}
