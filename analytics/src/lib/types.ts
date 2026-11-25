/**
 * Core Types & Domain Models for DGP Pass & Bandobusth Analytics
 * 61st All India DGsP / IGPs Conference - 2026
 * Tirupati District Police, Andhra Pradesh
 */

export type Breakdown = { name: string; total: number; printed: number; ready: number };

export interface PoliceLiveZoneRow {
  name: string;
  total: number;
  dutyAssigned: number;
  pendingDuty: number;
  printed: number;
  collected: number;
}

export interface PoliceLiveSectorRow {
  zone: string;
  sectorNumber: string;
  total: number;
  dutyAssigned: number;
  printed: number;
  collected: number;
}

export interface PoliceLiveRankRow {
  rank: string;
  total: number;
  dutyAssigned: number;
  printed: number;
  collected: number;
}

export interface PoliceLiveDistrictRow {
  name: string;
  total: number;
  dutyAssigned: number;
  printed: number;
  collected: number;
}

export interface PoliceLiveCounterRow {
  counterId: string;
  total: number;
  printed: number;
  collected: number;
}

export interface PoliceLiveComponentRow {
  component: string;
  total: number;
  assignedCount: number;
  zonesCovered: string[];
}

export interface PoliceLiveSnapshot {
  summary: {
    total: number;
    dutyAssigned: number;
    pendingDuty: number;
    readyToPrint: number;
    printed: number;
    collected: number;
    revoked: number;
    unassignedZone: number;
  };
  zones: PoliceLiveZoneRow[];
  sectors: PoliceLiveSectorRow[];
  ranks: PoliceLiveRankRow[];
  districts: PoliceLiveDistrictRow[];
  counters: PoliceLiveCounterRow[];
  securityComponents: PoliceLiveComponentRow[];
}

export type Analytics = {
  updatedAt: string;
  filters: { days: number; institution: string };
  summary: {
    total: number;
    printed: number;
    ready: number;
    pending: number;
    approved?: number;
    issued: number;
    revoked: number;
    printRuns: number;
    reprints: number;
    today: number;
    internal: number;
    external: number;
    zoneA: number;
    zoneB: number;
    zoneC: number;
  };
  offices: (Breakdown & { id: string; pending: number; issued: number; revoked: number })[];
  institutions: Breakdown[];
  categories: Breakdown[];
  departments: Breakdown[];
  statuses: { name: string; total: number }[];
  trend: { date: string; total: number }[];
  police?: PoliceLiveSnapshot;
};

export type OperationsDomain = 'all' | 'police' | 'campus';

export type PoliceRank =
  | 'PC'
  | 'WPC'
  | 'HG'
  | 'HC'
  | 'WHC'
  | 'ASI'
  | 'WASI'
  | 'SI'
  | 'CI'
  | 'DSP'
  | 'Addl. SP'
  | 'SP'
  | 'ARPC'
  | 'ARHC'
  | 'ARSI'
  | 'RSI'
  | 'RI';

export type PoliceRankGroup =
  | 'PC'
  | 'WPC'
  | 'HG'
  | 'ASI/HC'
  | 'SI'
  | 'CI'
  | 'DSP'
  | 'Addl. SP'
  | 'SP'
  | 'ARPC'
  | 'ARHC'
  | 'ARSI'
  | 'RSI'
  | 'RI';

export type PoliceCadreGroup = 'Senior Officers' | 'Subordinate Officers' | 'Field Ranks' | 'Armed Reserve';

export interface PoliceSectorItem {
  number: string;
  name: string;
  subSectors?: string[];
  allocation?: number;
}

export interface PoliceZoneTaxonomy {
  id: string;
  number: number;
  name: string;
  subtitle?: string;
  totalAllocation: number;
  sectors: PoliceSectorItem[];
}

export type IssuingCounterId =
  | 'COUNTER-PARADE-GROUNDS'
  | 'COUNTER-AIRPORT'
  | 'COUNTER-VENUES'
  | 'COUNTER-HOTELS'
  | 'COUNTER-ICCC'
  | 'Unassigned';

export interface IssuingCounterInfo {
  id: IssuingCounterId;
  name: string;
  location: string;
  description: string;
}

export type SecurityComponentType =
  | 'ACT TEAMS'
  | 'ASC TEAMS'
  | 'AREA DOMINATION TEAMS'
  | 'ROAD OPENING PARTY'
  | 'AR GUARDS'
  | 'BDDS / QRT'
  | 'OCTOPUS (QRT)'
  | 'GREYHOUNDS (AREA DOMINATION)'
  | 'APSP BATTALION GUARDS'
  | 'CONVOY / PILOT / ESCORT'
  | 'OTHERS';

export interface PoliceForceSummary {
  totalForce: number;
  targetForceAllocation: number;
  assignedDuty: number;
  pendingDuty: number;
  readyToPrintBadges: number;
  printedBadges: number;
  collectedBadges: number;
  revokedBadges: number;
  unassignedZone: number;
  handoverPercentage: number;
  deploymentPercentage: number;
}

export interface PoliceZoneTelemetry {
  zoneId: string;
  zoneNumber: number;
  name: string;
  subtitle: string;
  targetAllocation: number;
  currentStrength: number;
  dutyAssigned: number;
  pendingDuty: number;
  printed: number;
  collected: number;
  fillRatePercentage: number;
  status: 'surplus' | 'balanced' | 'under-strength';
  sectors: Array<{
    number: string;
    name: string;
    targetAllocation: number;
    assignedCount: number;
    printedCount: number;
    collectedCount: number;
    subSectorsCount: number;
  }>;
}

export interface PoliceCounterTelemetry {
  counterId: string;
  name: string;
  location: string;
  allocatedBadges: number;
  printedBadges: number;
  collectedBadges: number;
  pendingCollection: number;
  fulfillmentPercentage: number;
}

export interface PoliceRankTelemetry {
  group: string;
  label: string;
  cadre: PoliceCadreGroup;
  component: 'CIVIL' | 'AR';
  totalPersonnel: number;
  assignedDuty: number;
  badgesPrinted: number;
  badgesHandedOver: number;
}

export interface PoliceSecurityComponentTelemetry {
  component: string;
  totalPersonnel: number;
  assignedCount: number;
  zonesCovered: string[];
}

export interface PoliceDeploymentTelemetry {
  updatedAt: string;
  summary: PoliceForceSummary;
  zones: PoliceZoneTelemetry[];
  counters: PoliceCounterTelemetry[];
  ranks: PoliceRankTelemetry[];
  districts: PoliceLiveDistrictRow[];
  securityComponents: PoliceSecurityComponentTelemetry[];
}
