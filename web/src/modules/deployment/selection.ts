/**
 * Deployment service — random officer selection for SP allotment.
 * Pure logic (no database, no framework) so it can move into its own service unchanged.
 *
 * ASI/HC selection:  ASI 20% · WASI 5% · HC 70% · WHC 5%, and within ASI/HC 40% old : 60% young.
 * Every other rank group is a plain random pick.
 */

export const ASI_HC_GROUP = 'ASI/HC';
export const ASI_HC_MIX: Readonly<Record<string, number>> = { ASI: 0.2, WASI: 0.05, HC: 0.7, WHC: 0.05 };
export const AGE_MIX: Readonly<Record<AgeBand, number>> = { OLD: 0.4, YOUNG: 0.6 };

export type AgeBand = 'OLD' | 'YOUNG';

export interface SelectionCandidate {
  id: string;
  rank: string;
  /** Age in years, or null when the roster has no DOB / age. */
  age: number | null;
}

export interface SelectionBucket {
  rank: string;
  band: AgeBand | 'ANY';
  target: number;
  actual: number;
}

export interface SelectionResult {
  selectedIds: string[];
  requested: number;
  poolSize: number;
  buckets: SelectionBucket[];
  /** Officers short of the requested count (pool too small). */
  shortfall: number;
  notes: string[];
}

export type RandomInt = (maxExclusive: number) => number;

/** Fisher–Yates shuffle using the given random source (crypto.randomInt on the server). */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Splits total across weights with the largest-remainder method, so the parts always add up to total. */
export function largestRemainder(total: number, weights: Readonly<Record<string, number>>): Record<string, number> {
  const entries = Object.entries(weights);
  const sum = entries.reduce((acc, [, weight]) => acc + weight, 0) || 1;
  const raw = entries.map(([key, weight]) => ({ key, exact: (total * weight) / sum }));
  const result: Record<string, number> = {};
  let assigned = 0;
  for (const item of raw) {
    result[item.key] = Math.floor(item.exact);
    assigned += result[item.key];
  }
  raw
    .map((item, index) => ({ ...item, index, remainder: item.exact - Math.floor(item.exact) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, total - assigned)
    .forEach(item => { result[item.key] += 1; });
  return result;
}

export function ageBand(age: number | null, cutoffYears: number): AgeBand | null {
  if (age === null || !Number.isFinite(age)) return null;
  return age >= cutoffYears ? 'OLD' : 'YOUNG';
}

/** Target counts per ASI/HC sub-rank and age band, e.g. 200 → ASI 16/24, WASI 4/6, HC 56/84, WHC 4/6. */
export function asiHcTargets(count: number): SelectionBucket[] {
  const weights: Record<string, number> = {};
  for (const [rank, share] of Object.entries(ASI_HC_MIX)) {
    for (const [band, bandShare] of Object.entries(AGE_MIX)) weights[`${rank}|${band}`] = share * bandShare;
  }
  const split = largestRemainder(count, weights);
  return Object.entries(split).map(([key, target]) => {
    const [rank, band] = key.split('|');
    return { rank, band: band as AgeBand, target, actual: 0 };
  });
}

export function selectOfficers(
  pool: readonly SelectionCandidate[],
  rankGroup: string,
  count: number,
  cutoffYears: number,
  randomInt: RandomInt,
): SelectionResult {
  const requested = Math.max(0, Math.floor(count));
  const unique = [...new Map(pool.map(candidate => [candidate.id, candidate])).values()];
  const shuffled = shuffle(unique, randomInt);
  const notes: string[] = [];

  if (rankGroup !== ASI_HC_GROUP) {
    const selectedIds = shuffled.slice(0, requested).map(candidate => candidate.id);
    const shortfall = requested - selectedIds.length;
    if (shortfall > 0) notes.push(`Only ${selectedIds.length} ${rankGroup} officers match these districts.`);
    return {
      selectedIds, requested, poolSize: unique.length, shortfall, notes,
      buckets: [{ rank: rankGroup, band: 'ANY', target: requested, actual: selectedIds.length }],
    };
  }

  const buckets = asiHcTargets(requested);
  const taken = new Set<string>();
  const selectedIds: string[] = [];
  const take = (candidate: SelectionCandidate, bucket: SelectionBucket) => {
    taken.add(candidate.id);
    selectedIds.push(candidate.id);
    bucket.actual += 1;
  };
  const free = (predicate: (candidate: SelectionCandidate) => boolean) =>
    shuffled.filter(candidate => !taken.has(candidate.id) && predicate(candidate));

  // 1. Exact sub-rank and age band.
  for (const bucket of buckets) {
    for (const candidate of free(c => c.rank === bucket.rank && ageBand(c.age, cutoffYears) === bucket.band).slice(0, bucket.target)) {
      take(candidate, bucket);
    }
  }
  // 2. Same sub-rank, other age band, then same sub-rank with unknown age.
  for (const fallback of ['OTHER_BAND', 'UNKNOWN_AGE'] as const) {
    for (const bucket of buckets) {
      const missing = bucket.target - bucket.actual;
      if (missing <= 0) continue;
      const matches = free(c => c.rank === bucket.rank && (fallback === 'OTHER_BAND'
        ? ageBand(c.age, cutoffYears) !== null && ageBand(c.age, cutoffYears) !== bucket.band
        : ageBand(c.age, cutoffYears) === null)).slice(0, missing);
      matches.forEach(candidate => take(candidate, bucket));
      if (matches.length) {
        notes.push(fallback === 'OTHER_BAND'
          ? `${matches.length} ${bucket.rank} ${bucket.band === 'OLD' ? 'old' : 'young'} place(s) filled with ${bucket.band === 'OLD' ? 'young' : 'old'} ${bucket.rank} officers.`
          : `${matches.length} ${bucket.rank} place(s) filled with officers whose age is not recorded.`);
      }
    }
  }
  // 3. Any remaining ASI/HC officer, so the requested count is met when the pool allows.
  for (const bucket of buckets) {
    const missing = bucket.target - bucket.actual;
    if (missing <= 0) continue;
    const matches = free(c => c.rank in ASI_HC_MIX).slice(0, missing);
    matches.forEach(candidate => {
      taken.add(candidate.id);
      selectedIds.push(candidate.id);
    });
    if (matches.length) notes.push(`${matches.length} ${bucket.rank} place(s) filled with other ASI/HC ranks.`);
  }

  // Report the composition actually selected (officers with no recorded age are listed in the notes, not in a band).
  const byId = new Map(unique.map(candidate => [candidate.id, candidate]));
  for (const bucket of buckets) bucket.actual = 0;
  for (const id of selectedIds) {
    const candidate = byId.get(id)!;
    const band = ageBand(candidate.age, cutoffYears);
    const bucket = buckets.find(item => item.rank === candidate.rank && item.band === band);
    if (bucket) bucket.actual += 1;
  }

  const shortfall = requested - selectedIds.length;
  if (shortfall > 0) notes.push(`Only ${selectedIds.length} ASI/HC officers match these districts; ${shortfall} short.`);
  return { selectedIds, requested, poolSize: unique.length, buckets, shortfall, notes };
}

/** Composition of any set of officers, used when the SP adjusts the selection by hand. */
export function compositionOf(officers: readonly SelectionCandidate[], cutoffYears: number) {
  const counts: Record<string, { OLD: number; YOUNG: number; UNKNOWN: number }> = {};
  for (const officer of officers) {
    const row = counts[officer.rank] ??= { OLD: 0, YOUNG: 0, UNKNOWN: 0 };
    row[ageBand(officer.age, cutoffYears) ?? 'UNKNOWN'] += 1;
  }
  return counts;
}
