import { POLICE_BANDOBUSHT_ZONES } from './police-zones';

export type PolicePrintScope = { zone: string; sector: string | null };

export function parsePolicePrintScope(value: unknown): PolicePrintScope[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;

  const scope = new Map<string, PolicePrintScope>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === item.zone);
    if (!zone || (item.sector !== null && !zone.sectors.some(sector => sector.number === item.sector))) {
      return null;
    }
    scope.set(JSON.stringify([zone.name, item.sector]), { zone: zone.name, sector: item.sector });
  }
  const wholeZones = new Set([...scope.values()].filter(item => item.sector === null).map(item => item.zone));
  return [...scope.values()].filter(item => item.sector === null || !wholeZones.has(item.zone));
}
