/** Officer age helpers for personnel import and the ASI/HC old:young selection ratio. */

export const DEFAULT_AGE_CUTOFF_YEARS = 45;

const iso = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const plausible = (value: string) => {
  const year = Number(value.slice(0, 4));
  return value && year >= 1945 && year <= new Date().getUTCFullYear() - 17 ? value : '';
};

/**
 * Accepts an Excel serial date, YYYY-MM-DD, or DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (Indian day-first order).
 * Returns YYYY-MM-DD, or '' when the value is blank or not a plausible birth date.
 */
export function parseDateOfBirth(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial day 25569 is 1970-01-01.
    const date = new Date(Math.round((value - 25569) * 86400000));
    return plausible(iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return plausible(iso(value.getFullYear(), value.getMonth() + 1, value.getDate()));
  }
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{5}(\.\d+)?$/.test(text)) return parseDateOfBirth(Number(text));
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return plausible(iso(Number(match[1]), Number(match[2]), Number(match[3])));
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return plausible(iso(Number(match[3]), Number(match[2]), Number(match[1])));
  return '';
}

/** Whole years between 17 and 75, otherwise null. */
export function parseAgeYears(value: unknown): number | null {
  const age = Number(String(value ?? '').trim());
  return Number.isInteger(age) && age >= 17 && age <= 75 ? age : null;
}

/** Age in whole years on the reference date (YYYY-MM-DD, default today), from DOB or the recorded age. */
export function officerAge(
  officer: { date_of_birth?: string | null; age_years?: number | null },
  referenceDate = new Date().toISOString().slice(0, 10),
): number | null {
  const dob = officer.date_of_birth?.slice(0, 10);
  if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, d] = dob.split('-').map(Number);
    const [ry, rm, rd] = referenceDate.split('-').map(Number);
    return ry - y - (rm < m || (rm === m && rd < d) ? 1 : 0);
  }
  return officer.age_years ?? null;
}
