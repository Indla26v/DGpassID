export const AP_DISTRICTS = [
  'Alluri Sitharama Raju',
  'Anakapalli',
  'Ananthapuramu',
  'Annamayya',
  'Bapatla',
  'Chittoor',
  'Dr. B.R. Ambedkar Konaseema',
  'East Godavari',
  'Eluru',
  'Guntur',
  'Kakinada',
  'Krishna',
  'Kurnool',
  'Nandyal',
  'NTR',
  'Palnadu',
  'Parvathipuram Manyam',
  'Prakasam',
  'Sri Potti Sriramulu Nellore',
  'Sri Sathya Sai',
  'Srikakulam',
  'Tirupati',
  'Visakhapatnam',
  'Vizianagaram',
  'West Godavari',
  'YSR Kadapa',
] as const;

export const POLICE_SPECIAL_UNITS = [
  'Greyhounds',
  'OCTOPUS',
  'APSP Battalions',
  'ISW (VIP Security)',
  'State Intelligence (SIB)',
  'Counter Intelligence (CI Cell)',
  'CID (Crime Investigation)',
  'SDRF (Disaster Response)',
  'Police Communications / Telecom',
  'Police Transport Organisation (PTO)',
  'Dog Squad & Bomb Disposal (BDDS)',
  'Coastal Security Police (CSP)',
  'Special Enforcement Bureau (SEB)',
] as const;

export const DISTRICTS_AND_UNITS = [
  ...AP_DISTRICTS,
  ...POLICE_SPECIAL_UNITS,
] as const;

export type DistrictOrUnit = (typeof DISTRICTS_AND_UNITS)[number];

const DISTRICT_AND_UNIT_ALIASES: Record<string, DistrictOrUnit> = {
  // Districts
  asr: 'Alluri Sitharama Raju',
  alluri: 'Alluri Sitharama Raju',
  allurisitharamaraju: 'Alluri Sitharama Raju',
  anakapalle: 'Anakapalli',
  anakapalli: 'Anakapalli',
  anantapur: 'Ananthapuramu',
  anantapuramu: 'Ananthapuramu',
  ananthapur: 'Ananthapuramu',
  ananthapuramu: 'Ananthapuramu',
  annamayya: 'Annamayya',
  rayachoty: 'Annamayya',
  bapatla: 'Bapatla',
  chittoor: 'Chittoor',
  konaseema: 'Dr. B.R. Ambedkar Konaseema',
  amalapuram: 'Dr. B.R. Ambedkar Konaseema',
  brambedkar: 'Dr. B.R. Ambedkar Konaseema',
  eastgodavari: 'East Godavari',
  rajahmundry: 'East Godavari',
  rajamahendravaram: 'East Godavari',
  eluru: 'Eluru',
  guntur: 'Guntur',
  kakinada: 'Kakinada',
  krishna: 'Krishna',
  machilipatnam: 'Krishna',
  kurnool: 'Kurnool',
  nandyal: 'Nandyal',
  ntr: 'NTR',
  vijayawada: 'NTR',
  vijayawadacity: 'NTR',
  palnadu: 'Palnadu',
  narasaraopet: 'Palnadu',
  parvathipuram: 'Parvathipuram Manyam',
  manyam: 'Parvathipuram Manyam',
  parvathipurammanyam: 'Parvathipuram Manyam',
  prakasam: 'Prakasam',
  ongole: 'Prakasam',
  nellore: 'Sri Potti Sriramulu Nellore',
  spsnellore: 'Sri Potti Sriramulu Nellore',
  sripottisriramulunellore: 'Sri Potti Sriramulu Nellore',
  srisathyasai: 'Sri Sathya Sai',
  sathyasai: 'Sri Sathya Sai',
  puttaparthi: 'Sri Sathya Sai',
  srikakulam: 'Srikakulam',
  tirupati: 'Tirupati',
  // Spellings used by the AP Police citizen portal.
  tirupathi: 'Tirupati',
  ananthapuram: 'Ananthapuramu',
  ntrcommissionerate: 'NTR',
  visakhapatnamcommissionerate: 'Visakhapatnam',
  drbrambedkarkonaseema: 'Dr. B.R. Ambedkar Konaseema',
  tirupaticity: 'Tirupati',
  visakhapatnam: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  visakhapatnamcity: 'Visakhapatnam',
  vizianagaram: 'Vizianagaram',
  westgodavari: 'West Godavari',
  bhimavaram: 'West Godavari',
  kadapa: 'YSR Kadapa',
  ysr: 'YSR Kadapa',
  ysrkadapa: 'YSR Kadapa',

  // Specialized Police Units & Battalions
  greyhounds: 'Greyhounds',
  greyhound: 'Greyhounds',
  gh: 'Greyhounds',
  octopus: 'OCTOPUS',
  octo: 'OCTOPUS',
  oct: 'OCTOPUS',
  apsp: 'APSP Battalions',
  apspbattalion: 'APSP Battalions',
  apspbattalions: 'APSP Battalions',
  battalion: 'APSP Battalions',
  battalions: 'APSP Battalions',
  isw: 'ISW (VIP Security)',
  vipsecurity: 'ISW (VIP Security)',
  sib: 'State Intelligence (SIB)',
  intelligence: 'State Intelligence (SIB)',
  stateintelligence: 'State Intelligence (SIB)',
  stateintelligencebureau: 'State Intelligence (SIB)',
  ci: 'Counter Intelligence (CI Cell)',
  cicell: 'Counter Intelligence (CI Cell)',
  counterintelligence: 'Counter Intelligence (CI Cell)',
  cid: 'CID (Crime Investigation)',
  crimeinvestigation: 'CID (Crime Investigation)',
  sdrf: 'SDRF (Disaster Response)',
  disasterresponse: 'SDRF (Disaster Response)',
  telecom: 'Police Communications / Telecom',
  communications: 'Police Communications / Telecom',
  policecommunications: 'Police Communications / Telecom',
  pto: 'Police Transport Organisation (PTO)',
  transport: 'Police Transport Organisation (PTO)',
  bdds: 'Dog Squad & Bomb Disposal (BDDS)',
  dogsquad: 'Dog Squad & Bomb Disposal (BDDS)',
  bombdisposal: 'Dog Squad & Bomb Disposal (BDDS)',
  csp: 'Coastal Security Police (CSP)',
  coastalsecurity: 'Coastal Security Police (CSP)',
  seb: 'Special Enforcement Bureau (SEB)',
};

export function normalizeDistrict(input: string): string {
  if (!input || !input.trim()) return 'Tirupati';
  const clean = input.trim();
  const lower = clean.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (DISTRICT_AND_UNIT_ALIASES[lower]) {
    return DISTRICT_AND_UNIT_ALIASES[lower];
  }

  // Exact match check against standard list
  const exact = DISTRICTS_AND_UNITS.find((d) => d.toLowerCase() === clean.toLowerCase());
  if (exact) return exact;

  // Substring search
  for (const [key, standard] of Object.entries(DISTRICT_AND_UNIT_ALIASES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return standard;
    }
  }

  return clean;
}
