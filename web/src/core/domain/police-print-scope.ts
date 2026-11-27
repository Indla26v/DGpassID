import { POLICE_BANDOBUSHT_ZONES } from './police-zones';

/**
 * An area a login covers: a whole zone (sector null), one sector, or one sub-sector of a sector.
 * subSector is optional so assignments saved before sub-sector logins existed keep working.
 */
export type PolicePrintScope = { zone: string; sector: string | null; subSector?: string | null };

export function parsePolicePrintScope(value: unknown): PolicePrintScope[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;

  const scope = new Map<string, PolicePrintScope>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === item.zone);
    const sector = item.sector === null ? null : zone?.sectors.find(candidate => candidate.number === item.sector);
    if (!zone || (item.sector !== null && !sector)) return null;
    const subSector = item.subSector === undefined || item.subSector === null || item.subSector === '' ? null : String(item.subSector);
    if (subSector !== null && (!sector || !sector.subSectors?.includes(subSector))) return null;
    const area: PolicePrintScope = subSector ? { zone: zone.name, sector: item.sector, subSector } : { zone: zone.name, sector: item.sector };
    scope.set(JSON.stringify([zone.name, item.sector, subSector]), area);
  }
  const all = [...scope.values()];
  const wholeZones = new Set(all.filter(item => item.sector === null).map(item => item.zone));
  const wholeSectors = new Set(all.filter(item => item.sector !== null && !item.subSector).map(item => `${item.zone}|${item.sector}`));
  return all.filter(item => item.sector === null ||
    (!wholeZones.has(item.zone) && (!item.subSector || !wholeSectors.has(`${item.zone}|${item.sector}`))));
}

/**
 * True when the login's areas include this posting. Without a sector, asks whether the login covers the
 * whole zone; without a sub-sector, whether it covers the whole sector.
 */
export function scopeCovers(scope: PolicePrintScope[], zone: string | null | undefined, sector?: string | null, subSector?: string | null): boolean {
  return scope.some(area => area.zone === zone &&
    (area.sector === null || (Boolean(sector) && area.sector === sector &&
      (!area.subSector || (Boolean(subSector) && area.subSector === subSector)))));
}

/** True when the login reaches into this zone / sector at all (any of its areas lies inside it). */
export function scopeTouches(scope: PolicePrintScope[], zone: string | null | undefined, sector?: string | null): boolean {
  return scope.some(area => area.zone === zone && (!sector || area.sector === null || area.sector === sector));
}

/**
 * Sub-sectors of a sector that the login is limited to, or null when it covers the whole sector
 * (or the whole zone). 'ALL' is the SP.
 */
export function limitedSubSectors(scope: PolicePrintScope[] | 'ALL', zone: string, sector: string): string[] | null {
  if (scope === 'ALL') return null;
  const areas = scope.filter(area => area.zone === zone && (area.sector === null || area.sector === sector));
  if (!areas.length || areas.some(area => area.sector === null || !area.subSector)) return null;
  return areas.map(area => area.subSector as string);
}

/** "Venues · Sector 1 · 1(A) IISER main gate and inside" (or "All sectors"). */
export function describeScopeArea(area: PolicePrintScope): string {
  return [area.zone, area.sector ?? 'All sectors', area.subSector].filter(Boolean).join(' · ');
}
