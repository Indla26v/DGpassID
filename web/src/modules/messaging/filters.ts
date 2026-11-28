import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { RANK_GROUPS } from '@/core/domain/ranks';
import type { RecipientFilters } from './messaging.repository';

/** Validates recipient filters from a request body; returns an error message instead when invalid. */
export function parseRecipientFilters(body: Record<string, unknown>): RecipientFilters | string {
  const zone = body.zone ? POLICE_BANDOBUSHT_ZONES.find(item => item.name === body.zone) : undefined;
  if (body.zone && !zone) return 'Choose a zone from the scheme.';
  const sector = body.sectorNumber ? zone?.sectors.find(item => item.number === body.sectorNumber) : undefined;
  if (body.sectorNumber && !sector) return 'Choose a sector inside the zone.';
  const strings = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))].slice(0, 100)
    : [];
  const groups = strings(body.ranks).map(group => RANK_GROUPS.find(item => item.group === group)).filter(Boolean);
  return {
    zone: zone?.name,
    sectorNumber: sector?.number,
    districts: strings(body.districts),
    ranks: groups.flatMap(group => [...group!.ranks]),
    onlyOnPoint: body.onlyOnPoint === true,
  };
}
