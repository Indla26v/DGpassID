/**
 * Police stations master data helpers (shared by the browser and the server).
 */
import { normalizeDistrict } from './districts';

export interface MasterStation { district: string; name: string; active?: boolean }

/** Comparison key: case, spaces and punctuation ignored ("CCS , Tirupathi" = "ccs tirupathi"). */
export const stationKey = (name?: string | null) => (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Same district / unit, allowing the app's spellings and aliases ("Tirupathi" = "Tirupati"). */
export const sameDistrict = (a?: string | null, b?: string | null) =>
  Boolean(a?.trim() && b?.trim()) && (a!.trim().toLowerCase() === b!.trim().toLowerCase() || normalizeDistrict(a!) === normalizeDistrict(b!));

/** Active master stations of a district (all districts when district is blank), sorted by name. */
export function stationsOfDistrict(stations: MasterStation[], district?: string | null): MasterStation[] {
  return stations
    .filter(item => item.active !== false && (!district?.trim() || sameDistrict(item.district, district)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The master spelling of a typed or imported station name: same district first, otherwise a name that is unique
 * across all districts. Returns undefined when it is not in the master list.
 */
export function canonicalStation(stations: MasterStation[], district: string | null | undefined, name: string | null | undefined): string | undefined {
  const key = stationKey(name);
  if (!key) return undefined;
  const inDistrict = stationsOfDistrict(stations, district).find(item => stationKey(item.name) === key);
  if (inDistrict) return inDistrict.name;
  const anywhere = stations.filter(item => item.active !== false && stationKey(item.name) === key);
  return new Set(anywhere.map(item => item.name)).size === 1 ? anywhere[0].name : undefined;
}
