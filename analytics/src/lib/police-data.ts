/**
 * Official Bandobusth Scheme Taxonomy & Live Telemetry Aggregator
 * Aligned with web/src/core/domain/{police-zones,ranks,zones,offices,districts}.ts
 * 61st All India DGsP / IGPs Conference - 2026
 */

import type {
  IssuingCounterId,
  IssuingCounterInfo,
  PoliceCadreGroup,
  PoliceCounterTelemetry,
  PoliceDeploymentTelemetry,
  PoliceForceSummary,
  PoliceLiveSnapshot,
  PoliceRankTelemetry,
  PoliceSecurityComponentTelemetry,
  PoliceZoneTaxonomy,
  PoliceZoneTelemetry,
  SecurityComponentType,
} from './types';

// ============================================================================
// 1. POLICE RANKS TAXONOMY (aligned with web/src/core/domain/ranks.ts)
// ============================================================================

export const RANK_GROUP_META: Array<{
  group: string;
  label: string;
  cadre: PoliceCadreGroup;
  component: 'CIVIL' | 'AR';
  ranks: readonly string[];
}> = [
  { group: 'SP', label: 'Superintendent of Police', cadre: 'Senior Officers', component: 'CIVIL', ranks: ['SP'] },
  { group: 'Addl. SP', label: 'Additional Superintendent of Police', cadre: 'Senior Officers', component: 'CIVIL', ranks: ['Addl. SP'] },
  { group: 'DSP', label: 'Deputy Superintendent of Police', cadre: 'Senior Officers', component: 'CIVIL', ranks: ['DSP'] },
  { group: 'CI', label: 'Circle Inspector', cadre: 'Subordinate Officers', component: 'CIVIL', ranks: ['CI'] },
  { group: 'SI', label: 'Sub-Inspector', cadre: 'Subordinate Officers', component: 'CIVIL', ranks: ['SI'] },
  { group: 'ASI/HC', label: 'ASI / Head Constable (ASI, WASI, HC, WHC)', cadre: 'Subordinate Officers', component: 'CIVIL', ranks: ['ASI', 'WASI', 'HC', 'WHC'] },
  { group: 'PC', label: 'Police Constable', cadre: 'Field Ranks', component: 'CIVIL', ranks: ['PC'] },
  { group: 'WPC', label: 'Women Police Constable', cadre: 'Field Ranks', component: 'CIVIL', ranks: ['WPC'] },
  { group: 'HG', label: 'Home Guard', cadre: 'Field Ranks', component: 'CIVIL', ranks: ['HG'] },
  { group: 'RI', label: 'Reserve Inspector (AR)', cadre: 'Armed Reserve', component: 'AR', ranks: ['RI'] },
  { group: 'RSI', label: 'Reserve Sub-Inspector (AR)', cadre: 'Armed Reserve', component: 'AR', ranks: ['RSI'] },
  { group: 'ARSI', label: 'Assistant Reserve Sub-Inspector (AR)', cadre: 'Armed Reserve', component: 'AR', ranks: ['ARSI'] },
  { group: 'ARHC', label: 'Armed Reserve Head Constable (AR)', cadre: 'Armed Reserve', component: 'AR', ranks: ['ARHC'] },
  { group: 'ARPC', label: 'Armed Reserve Police Constable (AR)', cadre: 'Armed Reserve', component: 'AR', ranks: ['ARPC'] },
];

const compactRank = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, '');

const RANK_ALIASES: Record<string, string> = {
  PC: 'PC',
  CONSTABLE: 'PC',
  POLICECONSTABLE: 'PC',
  CIVILPC: 'PC',
  SCTPC: 'PC',
  WPC: 'WPC',
  WOMANPC: 'WPC',
  WOMENPC: 'WPC',
  WOMANCONSTABLE: 'WPC',
  WOMENCONSTABLE: 'WPC',
  LPC: 'WPC',
  SCTWPC: 'WPC',
  SCTWPCS: 'WPC',
  HG: 'HG',
  HOMEGUARD: 'HG',
  HOMEGUARDS: 'HG',
  HC: 'HC',
  HEADCONSTABLE: 'HC',
  CIVILHC: 'HC',
  WHC: 'WHC',
  WOMANHC: 'WHC',
  WOMENHC: 'WHC',
  WOMANHEADCONSTABLE: 'WHC',
  WOMENHEADCONSTABLE: 'WHC',
  LHC: 'WHC',
  ASI: 'ASI',
  ASSISTANTSUBINSPECTOR: 'ASI',
  ASSTSUBINSPECTOR: 'ASI',
  WASI: 'WASI',
  WOMANASI: 'WASI',
  WOMENASI: 'WASI',
  WOMANASSISTANTSUBINSPECTOR: 'WASI',
  LASI: 'WASI',
  SI: 'SI',
  SUBINSPECTOR: 'SI',
  SIOFPOLICE: 'SI',
  CI: 'CI',
  CIRCLEINSPECTOR: 'CI',
  INSPECTOR: 'CI',
  INSPECTOROFPOLICE: 'CI',
  DSP: 'DSP',
  DYSP: 'DSP',
  DEPUTYSUPERINTENDENTOFPOLICE: 'DSP',
  ADDLSP: 'Addl. SP',
  ADDITIONALSP: 'Addl. SP',
  ADDLSUPERINTENDENTOFPOLICE: 'Addl. SP',
  SP: 'SP',
  SUPERINTENDENTOFPOLICE: 'SP',
  ARPC: 'ARPC',
  ARCONSTABLE: 'ARPC',
  ARMEDRESERVEPC: 'ARPC',
  ARMEDRESERVECONSTABLE: 'ARPC',
  APSPPC: 'ARPC',
  ARHC: 'ARHC',
  ARHEADCONSTABLE: 'ARHC',
  ARMEDRESERVEHC: 'ARHC',
  ARMEDRESERVEHEADCONSTABLE: 'ARHC',
  ARSI: 'ARSI',
  ASSISTANTRESERVESUBINSPECTOR: 'ARSI',
  ASSTRESERVESUBINSPECTOR: 'ARSI',
  RSI: 'RSI',
  RESERVESUBINSPECTOR: 'RSI',
  RPSI: 'RSI',
  RI: 'RI',
  RESERVEINSPECTOR: 'RI',
};

export function resolveRankGroup(rawRank: string): string {
  const canonical = RANK_ALIASES[compactRank(rawRank)] ?? rawRank.trim().toUpperCase();
  const match = RANK_GROUP_META.find((meta) => meta.ranks.includes(canonical));
  return match ? match.group : rawRank.trim() || 'Unspecified';
}

// ============================================================================
// 2. BANDOBUSTH ZONES TAXONOMY (aligned with web/src/core/domain/police-zones.ts)
// ============================================================================

export const OFFICIAL_BANDOBUSHT_ZONES: readonly PoliceZoneTaxonomy[] = [
  {
    id: 'ZONE-1',
    number: 1,
    name: 'International Airport, Renigunta',
    subtitle: 'Airport Reception, Terminals & VIP Movements',
    totalAllocation: 178,
    sectors: [{ number: 'Sector 1', name: 'International Airport, Renigunta', allocation: 178 }],
  },
  {
    id: 'ZONE-2',
    number: 2,
    name: 'Venues',
    subtitle: 'IISER, IIT, Srivari Temple',
    totalAllocation: 731,
    sectors: [
      {
        number: 'Sector 1',
        name: 'IISER and its surroundings',
        allocation: 374,
        subSectors: [
          '1(A) IISER main gate and inside',
          '1(B) IISER inside Parking area',
          '1(C) IISER residential quarters route BB for delegates',
          '1(D) IISER Roof tops',
          '1(E) IISER Surroundings',
          '1(F) Parking Place(ITDC Labour Camp) - Outside IISER towards Jangalapalli',
          '1(G) Pickets at Road side Villages',
        ],
      },
      { number: 'Sector 2', name: 'IIT, Tirupati', allocation: 123 },
      { number: 'Sector 3', name: 'Srivari Temple, Tirumala', allocation: 234 },
    ],
  },
  {
    id: 'ZONE-3',
    number: 3,
    name: 'Routes',
    subtitle: 'Airport to IISER & IISER to Tirumala',
    totalAllocation: 882,
    sectors: [
      {
        number: 'Sector 1',
        name: 'Route from Airport to IISER',
        allocation: 422,
        subSectors: [
          '1(A) Route BB from Jinkalamitta to Seetharampeta fly over Junction',
          '1(B) Route BB from Culvert Near Seetharampeta fly over Junction to IISER',
          '1(C) Route Mobiles (2 shifts)',
        ],
      },
      { number: 'Sector 2', name: 'Route Bandobust from Guttivaripalli cross to Sahaya College (Daminedu)', allocation: 96 },
      { number: 'Sector 3', name: "Route from Daminedu 'U' turn to Garuda Circle", allocation: 289 },
      { number: 'Sector 4', name: 'Garuda Arch, Tirupati to GNC toll gate, Tirumala', allocation: 75 },
    ],
  },
  {
    id: 'ZONE-4',
    number: 4,
    name: 'Traffic',
    subtitle: 'Tirupati and Tirumala Traffic Component',
    totalAllocation: 435,
    sectors: [
      { number: 'Sector 1', name: 'Airport to IISER', allocation: 80 },
      { number: 'Sector 2', name: 'Airport to IIT', allocation: 24 },
      { number: 'Sector 3', name: 'IIT To IISER' },
      { number: 'Sector 4', name: 'Airport To Culinary Institute', allocation: 22 },
      { number: 'Sector 5', name: 'Taj Hotel To Airport Junction', allocation: 31 },
      { number: 'Sector 6', name: 'SV University To Taj Hotel', allocation: 21 },
      { number: 'Sector 7', name: 'Manasa Sarovar Hotel To Airport Junction', allocation: 29 },
      { number: 'Sector 8', name: 'Bliss Hotel To Ramanuja Junction To Taj Hotel', allocation: 11 },
      { number: 'Sector 9', name: 'Kapilteertham To Manasa Sarovar', allocation: 16 },
      { number: 'Sector 10', name: 'Tirupati Town Traffic Strengthening', allocation: 86 },
      { number: 'Sector 11', name: 'SV University To Garuda Circle' },
      { number: 'Sector 12', name: 'Garuda Circle To Kapilatheertham' },
      { number: 'Sector 13', name: 'Ramanuja Circle To Sindhu Junction' },
      { number: 'Sector 14', name: 'Annamayya Junction - RC puram Junction' },
      { number: 'Sector 15', name: 'Cherlopalli Junction - Omega Hospital Upparapalli Circle', allocation: 6 },
      { number: 'Sector 16', name: 'Garuda Circle To Sri Venkateswara Agriculture University', allocation: 31 },
      { number: 'Sector 17', name: 'Tirumala Traffic component', allocation: 78 },
    ],
  },
  {
    id: 'ZONE-5',
    number: 5,
    name: 'Accommodations/Stay Places',
    subtitle: 'ICI & SV Alumni Guest Houses, Private Hotels and Homestays',
    totalAllocation: 427,
    sectors: [
      { number: 'Sector 1', name: 'ICI & SV Alumni Guest Houses', allocation: 24 },
      {
        number: 'Sector 2',
        name: 'Hotels and Homestays',
        allocation: 133,
        subSectors: [
          'ICI',
          'SVAC',
          'TAAJ',
          'GRAND RIDGE',
          'MARRIOT',
          'REGENTA',
          'LEMON TREE',
          'MARASA SAROVAR',
          'BLISS',
          'FORTUNE KENCES',
          'PAI VAISROY',
          'RAJ PARK',
          'OTHERS',
        ],
      },
      { number: 'Sector 3', name: 'Places of Stay at Tirumala', allocation: 270 },
    ],
  },
  {
    id: 'ZONE-6',
    number: 6,
    name: 'ICCC, Sub-Controls & Essentials',
    subtitle: 'Integrated Command and Control Center & Liaison',
    totalAllocation: 576,
    sectors: [
      { number: 'Sector 1', name: 'IIT-Integrated control room (ICCC) old library', allocation: 34 },
      { number: 'Sector 2', name: 'Sub-Controls', allocation: 393 },
      { number: 'Sector 3', name: 'Liaison - Essential Service Dept.', allocation: 149 },
    ],
  },
  {
    id: 'ZONE-7',
    number: 7,
    name: 'Contingency Plan',
    subtitle: 'Contingency Routes, Hospitals, Safe Houses & Reserve Force',
    totalAllocation: 487,
    sectors: [
      { number: 'Sector 1', name: 'Contingency route', allocation: 121 },
      { number: 'Sector 2', name: 'Contingency Hospitals', allocation: 33 },
      { number: 'Sector 3', name: 'Safe Houses', allocation: 21 },
      { number: 'Sector 4', name: 'Lodges/Hotels/Homestays Checking/ Night Patrols & Vehicle checking', allocation: 97 },
      { number: 'Sector 5', name: 'Reserve Force', allocation: 215 },
    ],
  },
  {
    id: 'ZONE-8',
    number: 8,
    name: 'Security Component',
    subtitle: 'AR Component, Greyhounds, OCTOPUS, BDDS & Specialized Units',
    totalAllocation: 2824,
    sectors: [
      {
        number: 'Sector 1',
        name: 'AR Component (Convoys, Pilots, Escorts, PSOs)',
        allocation: 1901,
        subSectors: [
          'Convoy Officers - Civil component',
          'Liaison officers',
          'Special Party (30 @ 10 each)',
          'APSP (15 Platoons) - (Guard duties)',
          'OCTOPUS Teams (04 Teams) - (QRT)',
          'Greyhounds (06 Units) - (Area Domination)',
          'CPT/APT Teams (10) - SSG/ISW (VIP Security)',
          "1(A) Hon'ble Prime Minister of India",
          "1(B) Hon'ble Central Home Minister",
          "1(C) Hon'ble CM of AP",
          "1(D) Hon'ble National Security Advisor",
          "1(E) Hon'ble Governor of AP",
          "1(F) Hon'ble Dy CM of AP",
          "1(G) Hon'ble IT Minister of AP",
          "1(H) Hon'ble Home Minister of AP",
          '1(I) Other Ministers & Senior Police Officers',
          'AR Force in safari for other security duties',
          'Guards',
          'Safe Houses & Safe Contingency Hospitals',
          'Supervising Officers',
        ],
      },
      { number: 'Sector 2', name: 'MT Section (Drivers)', allocation: 229 },
      {
        number: 'Sector 3',
        name: 'BD Team Component (ASC/ACC/ROP)',
        allocation: 616,
        subSectors: [
          '3(A) Anti Sabotage checking teams (ASC teams)',
          '3(B) Access Control teams (ACC teams)',
          '3(C) Road Opening party teams (ROP teams)',
        ],
      },
      { number: 'Sector 4', name: 'SDRF (02 Teams) & NDRF (02 Teams)', allocation: 100 },
      { number: 'Sector 5', name: 'SB Spotters', allocation: 78 },
    ],
  },
];

export const TOTAL_OFFICIAL_FORCE_ALLOCATION = OFFICIAL_BANDOBUSHT_ZONES.reduce(
  (sum, zone) => sum + zone.totalAllocation,
  0
);

// ============================================================================
// 3. ACCESS ZONES & ISSUING COUNTERS & SECURITY COMPONENTS
// ============================================================================

export const CAMPUS_ACCESS_ZONES = [
  { key: 'A', label: 'Zone A', badgeTitle: 'Zone-A (Residential / Hostel)', subtitle: 'Inner Perimeter', tone: 'emerald' as const },
  { key: 'B', label: 'Zone B', badgeTitle: 'Zone-B (Academic / Admin)', subtitle: 'Middle Compound', tone: 'blue' as const },
  { key: 'C', label: 'Zone C', badgeTitle: 'Zone-C (Service / Utility)', subtitle: 'Outer Utility', tone: 'purple' as const },
] as const;

export const OFFICIAL_ISSUING_COUNTERS: readonly IssuingCounterInfo[] = [
  {
    id: 'COUNTER-PARADE-GROUNDS',
    name: 'Parade Grounds Base Station',
    location: 'District Police Parade Grounds, Tirupati',
    description: 'Main mobilisation depot, bulk deployment briefing and badge collection base',
  },
  {
    id: 'COUNTER-AIRPORT',
    name: 'Airport Reception Desk',
    location: 'Tirupati International Airport (TIR), Renigunta',
    description: 'Airport protocol desk, dignitary arrival reception and terminal security passes',
  },
  {
    id: 'COUNTER-VENUES',
    name: 'Venues Command Desk (IISER / IIT)',
    location: 'IISER Main Gate & IIT Transit Campus',
    description: 'Conference venue on-site command desk for delegates, staff, and venue security force',
  },
  {
    id: 'COUNTER-HOTELS',
    name: 'Hospitality & Stay Cluster',
    location: 'Taj Tirupati / Marasa Sarovar Hub',
    description: 'Liaison desk covering VVIP guest houses, luxury hotels, and delegate accommodations',
  },
  {
    id: 'COUNTER-ICCC',
    name: 'ICCC Central Distribution Point',
    location: 'Integrated Command and Control Center, IIT Old Library',
    description: 'Operational command, specialised tactical teams and central distribution hub',
  },
  {
    id: 'Unassigned',
    name: 'Awaiting Counter Assignment',
    location: 'District Police Headquarters',
    description: 'Pending operational counter allotment and roster allocation',
  },
];

export const SECURITY_COMPONENTS_LIST: readonly SecurityComponentType[] = [
  'ACT TEAMS',
  'ASC TEAMS',
  'AREA DOMINATION TEAMS',
  'ROAD OPENING PARTY',
  'AR GUARDS',
  'BDDS / QRT',
  'OCTOPUS (QRT)',
  'GREYHOUNDS (AREA DOMINATION)',
  'APSP BATTALION GUARDS',
  'CONVOY / PILOT / ESCORT',
  'OTHERS',
] as const;

// ============================================================================
// 4. LIVE SNAPSHOT AGGREGATOR (SOLID: transforms live DB rows into view models)
// ============================================================================

export function calculateZoneProgress(
  assigned: number,
  targetAllocation: number
): {
  percentage: number;
  status: 'surplus' | 'balanced' | 'under-strength';
} {
  if (targetAllocation <= 0) {
    return { percentage: assigned > 0 ? 100 : 0, status: 'balanced' };
  }
  const percentage = Math.round((assigned / targetAllocation) * 100);
  if (percentage < 90) return { percentage, status: 'under-strength' };
  if (percentage > 105) return { percentage, status: 'surplus' };
  return { percentage, status: 'balanced' };
}

export function buildPoliceTelemetryFromSnapshot(
  live: PoliceLiveSnapshot | undefined,
  updatedAt: string
): PoliceDeploymentTelemetry {
  const s = live?.summary ?? {
    total: 0,
    dutyAssigned: 0,
    pendingDuty: 0,
    readyToPrint: 0,
    printed: 0,
    collected: 0,
    revoked: 0,
    unassignedZone: 0,
  };

  const summary: PoliceForceSummary = {
    totalForce: s.total,
    targetForceAllocation: TOTAL_OFFICIAL_FORCE_ALLOCATION,
    assignedDuty: s.dutyAssigned,
    pendingDuty: s.pendingDuty,
    readyToPrintBadges: s.readyToPrint,
    printedBadges: s.printed,
    collectedBadges: s.collected,
    revokedBadges: s.revoked,
    unassignedZone: s.unassignedZone,
    handoverPercentage: s.total > 0 ? Math.round((s.collected / s.total) * 100) : 0,
    deploymentPercentage: s.total > 0 ? Math.round((s.dutyAssigned / s.total) * 100) : 0,
  };

  const zoneByName = new Map(
    (live?.zones ?? []).map((z) => [z.name.trim().toLowerCase(), z])
  );
  const sectorMap = new Map(
    (live?.sectors ?? []).map((sec) => [`${sec.zone.trim().toLowerCase()}|${sec.sectorNumber.trim().toLowerCase()}`, sec])
  );

  const zones: PoliceZoneTelemetry[] = OFFICIAL_BANDOBUSHT_ZONES.map((zone) => {
    const liveZone = zoneByName.get(zone.name.trim().toLowerCase());
    const currentStrength = liveZone?.total ?? 0;
    const dutyAssigned = liveZone?.dutyAssigned ?? 0;
    const pendingDuty = liveZone?.pendingDuty ?? 0;
    const printed = liveZone?.printed ?? 0;
    const collected = liveZone?.collected ?? 0;
    const { percentage, status } = calculateZoneProgress(currentStrength, zone.totalAllocation);

    return {
      zoneId: zone.id,
      zoneNumber: zone.number,
      name: zone.name,
      subtitle: zone.subtitle ?? `${zone.sectors.length} operational ${zone.sectors.length === 1 ? 'sector' : 'sectors'}`,
      targetAllocation: zone.totalAllocation,
      currentStrength,
      dutyAssigned,
      pendingDuty,
      printed,
      collected,
      fillRatePercentage: percentage,
      status,
      sectors: zone.sectors.map((sec) => {
        const liveSec = sectorMap.get(`${zone.name.trim().toLowerCase()}|${sec.number.trim().toLowerCase()}`);
        return {
          number: sec.number,
          name: sec.name,
          targetAllocation: sec.allocation ?? 0,
          assignedCount: liveSec?.total ?? 0,
          printedCount: liveSec?.printed ?? 0,
          collectedCount: liveSec?.collected ?? 0,
          subSectorsCount: sec.subSectors?.length ?? 0,
        };
      }),
    };
  });

  // Aggregate issuing counters (official counters + any unexpected counter IDs in DB)
  const counterById = new Map(
    (live?.counters ?? []).map((c) => [c.counterId.trim(), c])
  );
  const counters: PoliceCounterTelemetry[] = OFFICIAL_ISSUING_COUNTERS.map((info) => {
    const liveCounter = counterById.get(info.id);
    const allocatedBadges = liveCounter?.total ?? 0;
    const printedBadges = liveCounter?.printed ?? 0;
    const collectedBadges = liveCounter?.collected ?? 0;
    const pendingCollection = Math.max(0, allocatedBadges - collectedBadges);
    const fulfillmentPercentage =
      allocatedBadges > 0 ? Math.round((collectedBadges / allocatedBadges) * 100) : 0;
    return {
      counterId: info.id,
      name: info.name,
      location: info.location,
      allocatedBadges,
      printedBadges,
      collectedBadges,
      pendingCollection,
      fulfillmentPercentage,
    };
  });

  // Aggregate live DB ranks into canonical rank groups (matching web/src/core/domain/ranks.ts)
  const rankAccumulator = new Map<
    string,
    { label: string; cadre: PoliceCadreGroup; component: 'CIVIL' | 'AR'; total: number; assigned: number; printed: number; collected: number }
  >();
  for (const meta of RANK_GROUP_META) {
    rankAccumulator.set(meta.group, {
      label: meta.label,
      cadre: meta.cadre,
      component: meta.component,
      total: 0,
      assigned: 0,
      printed: 0,
      collected: 0,
    });
  }

  for (const row of live?.ranks ?? []) {
    const group = resolveRankGroup(row.rank);
    const entry = rankAccumulator.get(group) ?? {
      label: row.rank,
      cadre: 'Field Ranks' as PoliceCadreGroup,
      component: 'CIVIL' as const,
      total: 0,
      assigned: 0,
      printed: 0,
      collected: 0,
    };
    entry.total += row.total;
    entry.assigned += row.dutyAssigned;
    entry.printed += row.printed;
    entry.collected += row.collected;
    rankAccumulator.set(group, entry);
  }

  const ranks: PoliceRankTelemetry[] = Array.from(rankAccumulator.entries()).map(([group, stats]) => ({
    group,
    label: stats.label,
    cadre: stats.cadre,
    component: stats.component,
    totalPersonnel: stats.total,
    assignedDuty: stats.assigned,
    badgesPrinted: stats.printed,
    badgesHandedOver: stats.collected,
  }));

  // Aggregate live security components merged with official list
  const componentByName = new Map(
    (live?.securityComponents ?? []).map((sc) => [sc.component.trim().toUpperCase(), sc])
  );
  const securityComponents: PoliceSecurityComponentTelemetry[] = SECURITY_COMPONENTS_LIST.map((comp) => {
    const liveComp = componentByName.get(comp);
    return {
      component: comp,
      totalPersonnel: liveComp?.total ?? 0,
      assignedCount: liveComp?.assignedCount ?? 0,
      zonesCovered: liveComp?.zonesCovered ?? [],
    };
  });

  return {
    updatedAt,
    summary,
    zones,
    counters,
    ranks,
    districts: live?.districts ?? [],
    securityComponents,
  };
}

export function generatePoliceCsvRows(telemetry: PoliceDeploymentTelemetry): (string | number)[][] {
  return [
    ['--- POLICE BANDOBUSTH FORCE OPERATIONS (LIVE REGISTRY) ---', ''],
    ['Total Police Personnel Registered', telemetry.summary.totalForce],
    ['Official Scheme Force Allocation', telemetry.summary.targetForceAllocation],
    ['Duty Assigned Personnel', telemetry.summary.assignedDuty],
    ['Pending Assignment', telemetry.summary.pendingDuty],
    ['Ready to Print', telemetry.summary.readyToPrintBadges],
    ['Badges Printed', telemetry.summary.printedBadges],
    ['Badges Handed Over', telemetry.summary.collectedBadges],
    ['Deployment Coverage Rate', `${telemetry.summary.deploymentPercentage}%`],
    ['Handover Completion Rate', `${telemetry.summary.handoverPercentage}%`],
    [],
    ['Zone ID', 'Zone Number', 'Zone Name', 'Scheme Allocation', 'Live Force', 'Duty Assigned', 'Printed', 'Handed Over', 'Scheme Fill %'],
    ...telemetry.zones.map((z) => [
      z.zoneId,
      z.zoneNumber,
      z.name,
      z.targetAllocation,
      z.currentStrength,
      z.dutyAssigned,
      z.printed,
      z.collected,
      `${z.fillRatePercentage}%`,
    ]),
    [],
    ['District / Unit', 'Total Force', 'Duty Assigned', 'Printed', 'Handed Over'],
    ...telemetry.districts.map((d) => [d.name, d.total, d.dutyAssigned, d.printed, d.collected]),
    [],
    ['Rank Group', 'Designation', 'Cadre', 'Total Force', 'Duty Assigned', 'Printed', 'Handed Over'],
    ...telemetry.ranks.map((r) => [
      r.group,
      r.label,
      r.cadre,
      r.totalPersonnel,
      r.assignedDuty,
      r.badgesPrinted,
      r.badgesHandedOver,
    ]),
    [],
    ['Issuing Counter ID', 'Counter Name', 'Location', 'Allocated', 'Printed', 'Handed Over', 'Pending', 'Fulfillment %'],
    ...telemetry.counters.map((c) => [
      c.counterId,
      c.name,
      c.location,
      c.allocatedBadges,
      c.printedBadges,
      c.collectedBadges,
      c.pendingCollection,
      `${c.fulfillmentPercentage}%`,
    ]),
  ];
}
