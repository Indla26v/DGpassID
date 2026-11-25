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
  ADDLSP: 'Addl. SP', ADDITIONALSP: 'Addl. SP', ADDLSUPERINTENDENTOFPOLICE: 'Addl. SP',
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
