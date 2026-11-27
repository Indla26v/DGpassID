/**
 * Duty instructions the SP sends to zone / sector logins: a heading line, a table of report
 * entities (date, time, place) and a closing line. No path aliases (loaded directly by the tests).
 */
import { POLICE_BANDOBUSHT_ZONES } from './police-zones';
import { scopeCovers, type PolicePrintScope } from './police-print-scope';

export interface InstructionEntry {
  entity: string;
  /** YYYY-MM-DD or empty. */
  date: string;
  /** HH:MM (24 h) or empty. */
  time: string;
  place: string;
}

/**
 * Where an instruction is sent: a whole zone (sector null), a sector, or one sub-sector of a sector.
 * Zone / sector logins receive it when the zone or sector is theirs; passports are printed only for the
 * officers posted in the targeted sub-sectors.
 */
export interface InstructionTarget {
  zone: string;
  sector: string | null;
  subSector?: string | null;
}

export interface InstructionInput {
  title: string;
  heading: string;
  closing: string;
  entries: InstructionEntry[];
  targets: InstructionTarget[];
  /** Duty passport details. Empty strings when not set. */
  duty_from: string;
  duty_to: string;
  duty_hours: string;
  security_plan: string;
  place_of_duty: string;
  signatory: string;
  batch: string;
  /** Back side of the duty passport: a title and numbered points (no back page when empty). */
  back_title: string;
  back_points: string[];
}

/** The passport fields of an instruction, as stored (null when blank). */
export const PASSPORT_FIELDS = ['duty_from', 'duty_to', 'duty_hours', 'security_plan', 'place_of_duty', 'signatory', 'batch'] as const;

export const DEFAULT_HEADING = 'You are hereby instructed to report for duty as shown below.';
export const DEFAULT_CLOSING = 'You are further instructed to report back to the Station House Officer (SHO) at the Police Station immediately upon completion of duty.';
export const DEFAULT_INSTRUCTION_ENTRIES: InstructionEntry[] = ['Accommodation', 'Briefing', 'Spot Briefing', 'Rehearsal', 'Final Duty']
  .map(entity => ({ entity, date: '', time: '', place: '' }));
export const INSTRUCTION_COLUMNS = ['S.No', 'Report Entities', 'Date', 'Time', 'Place'] as const;

export const MAX_ENTRIES = 30;
export const MAX_BACK_POINTS = 20;
const MAX_BACK_POINT = 400;

export const DEFAULT_BACK_TITLE = 'Brief Instructions';
export const DEFAULT_BACK_POINTS = [
  'Report for duty 15 minutes before shift commencement and properly take over the duty.',
  'Remain alert and vigilant throughout the duty and continuously monitor the surrounding area.',
  'Keep the VHF set switched ON and maintain proper communication discipline.',
  'Use the binoculars continuously to monitor crowd movement, suspicious persons, unattended articles and vulnerable areas.',
  'Follow the buddy system and do not leave the watch tower unattended.',
  'Immediately report any suspicious activity, emergency, crowd congestion or security issue through VHF to the Control Room/concerned officer.',
  'Keep the VHF set and binoculars safe and in working condition and report any defects immediately.',
  'Avoid mobile phone use, unnecessary conversations and other distractions while on duty.',
  'Brief the relieving personnel about important observations/incidents before handing over the duty.',
  'Maintain discipline, confidentiality and strict compliance with instructions of supervisory officers.',
];
const MAX_CELL = 300;
const MAX_TEXT = 2000;

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (value: unknown, max: number) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

/** Cleans and checks an instruction. Returns the clean value or an error message. */
export function validateInstruction(raw: unknown): { value: InstructionInput } | { error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = clean(input.title, 200);
  if (!title) return { error: 'Give the instruction a title.' };
  if (!Array.isArray(input.entries)) return { error: 'Add at least one report entity.' };
  if (input.entries.length > MAX_ENTRIES) return { error: `Use at most ${MAX_ENTRIES} rows.` };
  const entries: InstructionEntry[] = [];
  for (const [index, item] of input.entries.entries()) {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const entry = {
      entity: clean(row.entity, MAX_CELL),
      date: clean(row.date, 10),
      time: clean(row.time, 5),
      place: clean(row.place, MAX_CELL),
    };
    if (!entry.entity && !entry.date && !entry.time && !entry.place) continue;
    if (!entry.entity) return { error: `Row ${index + 1}: enter the report entity.` };
    if (entry.date && !validDate(entry.date)) return { error: `Row ${index + 1}: enter a valid date.` };
    if (entry.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return { error: `Row ${index + 1}: enter the time as HH:MM.` };
    entries.push(entry);
  }
  if (!entries.length) return { error: 'Add at least one report entity.' };
  const targets = parseInstructionTargets(input.targets);
  if (!targets) return { error: 'Choose the zones, sectors or sub-sectors to send this to.' };
  const dutyFrom = clean(input.duty_from, 10);
  const dutyTo = clean(input.duty_to, 10);
  if (dutyFrom && !validDate(dutyFrom)) return { error: 'Enter a valid duty start date.' };
  if (dutyTo && !validDate(dutyTo)) return { error: 'Enter a valid duty end date.' };
  if (dutyFrom && dutyTo && dutyTo < dutyFrom) return { error: 'The duty end date cannot be before the start date.' };
  const rawPoints = input.back_points === undefined || input.back_points === null ? [] : input.back_points;
  if (!Array.isArray(rawPoints)) return { error: 'Enter the back-side points as a list.' };
  const backPoints = rawPoints.map(point => cleanBlock(point, MAX_BACK_POINT)).filter(Boolean);
  if (backPoints.length > MAX_BACK_POINTS) return { error: `Use at most ${MAX_BACK_POINTS} back-side points.` };
  return {
    value: {
      title,
      heading: cleanBlock(input.heading, MAX_TEXT),
      closing: cleanBlock(input.closing, MAX_TEXT),
      entries,
      targets,
      duty_from: dutyFrom,
      duty_to: dutyTo,
      duty_hours: clean(input.duty_hours, 60),
      security_plan: cleanBlock(input.security_plan, 600),
      place_of_duty: clean(input.place_of_duty, 120),
      signatory: cleanBlock(input.signatory, 200),
      batch: clean(input.batch, 60),
      back_title: clean(input.back_title, 200),
      back_points: backPoints,
    },
  };
}

/** YYYY-MM-DD as DD-MM-YYYY; anything else unchanged. */
export function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
}

/** Display text for a cell: DD-MM-YYYY dates, "-" for anything blank (never "NaN"). */
export function formatEntryCell(column: 'date' | 'time' | 'place' | 'entity', entry: InstructionEntry): string {
  const value = (entry[column] ?? '').trim();
  if (!value || value === 'NaN') return '-';
  return column === 'date' ? displayDate(value) : value;
}

/** Table rows (S.No, entity, date, time, place) ready for display or PDF. */
export function instructionRows(entries: InstructionEntry[]): string[][] {
  return entries.map((entry, index) => [
    String(index + 1),
    formatEntryCell('entity', entry),
    formatEntryCell('date', entry),
    formatEntryCell('time', entry),
    formatEntryCell('place', entry),
  ]);
}

/**
 * Checks and normalises targets: every zone, sector and sub-sector must exist in the scheme. A whole zone
 * replaces its sectors, and a whole sector replaces its sub-sectors. Null when the list is empty or invalid.
 */
export function parseInstructionTargets(value: unknown): InstructionTarget[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 300) return null;
  const found = new Map<string, InstructionTarget>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Record<string, unknown>;
    const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === raw.zone);
    if (!zone) return null;
    const sectorNumber = raw.sector === null || raw.sector === undefined || raw.sector === '' ? null : String(raw.sector);
    const sector = sectorNumber === null ? null : zone.sectors.find(candidate => candidate.number === sectorNumber);
    if (sectorNumber !== null && !sector) return null;
    const subName = raw.subSector === null || raw.subSector === undefined || raw.subSector === '' ? null : String(raw.subSector);
    if (subName !== null && (!sector || !sector.subSectors?.includes(subName))) return null;
    const target: InstructionTarget = subName ? { zone: zone.name, sector: sectorNumber, subSector: subName } : { zone: zone.name, sector: sectorNumber };
    found.set(JSON.stringify([target.zone, target.sector, target.subSector ?? null]), target);
  }
  const all = [...found.values()];
  const wholeZones = new Set(all.filter(item => item.sector === null).map(item => item.zone));
  const wholeSectors = new Set(all.filter(item => item.sector !== null && !item.subSector).map(item => `${item.zone}|${item.sector}`));
  return all.filter(item => item.sector === null ||
    (!wholeZones.has(item.zone) && (!item.subSector || !wholeSectors.has(`${item.zone}|${item.sector}`))));
}

/** True when any target overlaps the login's scope (same zone; whole zone on either side, or the same sector). */
export function instructionVisibleTo(targets: InstructionTarget[], scope: PolicePrintScope[]): boolean {
  return targets.some(target => scope.some(area => area.zone === target.zone &&
    (area.sector === null || target.sector === null || (area.sector === target.sector &&
      (!area.subSector || !target.subSector || area.subSector === target.subSector)))));
}

/**
 * True when every target lies inside the login's own area: same zone, and either the login covers the whole
 * zone or the target is one of its sectors. Zone / sector logins may only send instructions this way.
 */
export function targetsWithinScope(targets: InstructionTarget[], scope: PolicePrintScope[]): boolean {
  return targets.length > 0 && targets.every(target => scopeCovers(scope, target.zone, target.sector, target.subSector ?? null));
}

/** "Zone 2: Venues (all sectors); Zone 3: Routes · Sector 1 (1(A), 1(B)), Sector 2" */
export function describeTargets(targets: InstructionTarget[]): string {
  const byZone = new Map<string, Map<string | null, string[]>>();
  for (const target of targets) {
    const sectors = byZone.get(target.zone) ?? new Map<string | null, string[]>();
    const subs = sectors.get(target.sector) ?? [];
    if (target.subSector) subs.push(target.subSector.replace(/^(\d+\s*\([A-Z]\)).*$/i, '$1'));
    sectors.set(target.sector, subs);
    byZone.set(target.zone, sectors);
  }
  return [...byZone.entries()].map(([zoneName, sectors]) => {
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
    const label = zone ? `Zone ${zone.number}: ${zone.name}` : zoneName;
    if (sectors.has(null)) return `${label} (all sectors)`;
    return `${label} · ${[...sectors.entries()].map(([sector, subs]) => (subs.length ? `${sector} (${subs.join(', ')})` : sector)).join(', ')}`;
  }).join('; ');
}
