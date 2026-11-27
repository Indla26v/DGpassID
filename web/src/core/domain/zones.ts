import type { PassEntity } from './entities/pass.entity';

export type SecurityZoneKey = 'A' | 'B' | 'C';
export type SecurityZoneField = 'zone_a' | 'zone_b' | 'zone_c';
export type SecurityGateField = 'gate_zone_a' | 'gate_zone_b' | 'gate_zone_c';

export function getDefaultGate(institution: string | null | undefined, zone: SecurityZoneKey): string {
  const cleanInst = (institution || '').toUpperCase();
  const prefix = cleanInst === 'IIT' ? 'IIT' : cleanInst === 'ICI' || cleanInst === 'ICU' ? 'ICI' : 'IISER';
  switch (zone) {
    case 'A':
      return `${prefix} Gate-2 (Hostel Sector)`;
    case 'B':
      return `${prefix} Gate-1 (Main/Academic)`;
    case 'C':
      return `${prefix} Gate-3 (Utility/Service)`;
  }
}

export interface SecurityZoneItem {
  field: SecurityZoneField;
  gateField: SecurityGateField;
  key: SecurityZoneKey;
  label: string;
  badgeTitle: string;
  subtitle: string;
  color: 'emerald' | 'blue' | 'purple';
}

export const SECURITY_ZONES: SecurityZoneItem[] = [
  {
    field: 'zone_a',
    gateField: 'gate_zone_a',
    key: 'A',
    label: 'Zone A',
    badgeTitle: 'Zone-A (Residential / Hostel)',
    subtitle: 'Inner Perimeter',
    color: 'emerald',
  },
  {
    field: 'zone_b',
    gateField: 'gate_zone_b',
    key: 'B',
    label: 'Zone B',
    badgeTitle: 'Zone-B (Academic / Admin)',
    subtitle: 'Middle Compound',
    color: 'blue',
  },
  {
    field: 'zone_c',
    gateField: 'gate_zone_c',
    key: 'C',
    label: 'Zone C',
    badgeTitle: 'Zone-C (Service / Utility)',
    subtitle: 'Outer Utility',
    color: 'purple',
  },
];

export const CAMPUS_PRINT_ZONE_REQUIRED = 'Assign at least one access zone before printing.';

export function needsCampusPrintZone(
  pass: Pick<PassEntity, 'pass_type' | 'is_imported' | SecurityZoneField>,
): boolean {
  return pass.pass_type !== 'POLICE_FORCE' && !pass.is_imported &&
    !SECURITY_ZONES.some(({ field }) => pass[field] === true);
}
