/**
 * Duty instructions the SP sends to zone / sector logins: a heading line, a table of report
 * entities (date, time, place) and a closing line. No path aliases (loaded directly by the tests).
 */
import { POLICE_BANDOBUSHT_ZONES } from './police-zones';
import { parsePolicePrintScope, type PolicePrintScope } from './police-print-scope';

export interface InstructionEntry {
  entity: string;
  /** YYYY-MM-DD or empty. */
  date: string;
  /** HH:MM (24 h) or empty. */
  time: string;
  place: string;
}

export interface InstructionInput {
  title: string;
  heading: string;
  closing: string;
  entries: InstructionEntry[];
  targets: PolicePrintScope[];
}

export const DEFAULT_HEADING = 'You are hereby instructed to report for duty as shown below.';
export const DEFAULT_CLOSING = 'You are further instructed to report back to the Station House Officer (SHO) at the Police Station immediately upon completion of duty.';
export const DEFAULT_INSTRUCTION_ENTRIES: InstructionEntry[] = ['Accommodation', 'Briefing', 'Spot Briefing', 'Rehearsal', 'Final Duty']
  .map(entity => ({ entity, date: '', time: '', place: '' }));
export const INSTRUCTION_COLUMNS = ['S.No', 'Report Entities', 'Date', 'Time', 'Place'] as const;

export const MAX_ENTRIES = 30;
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
  const targets = parsePolicePrintScope(input.targets);
  if (!targets) return { error: 'Choose the zones (and sectors) to send this to.' };
  return {
    value: {
      title,
      heading: cleanBlock(input.heading, MAX_TEXT),
      closing: cleanBlock(input.closing, MAX_TEXT),
      entries,
      targets,
    },
  };
}

/** Display text for a cell: DD-MM-YYYY dates, "-" for anything blank (never "NaN"). */
export function formatEntryCell(column: 'date' | 'time' | 'place' | 'entity', entry: InstructionEntry): string {
  const value = (entry[column] ?? '').trim();
  if (!value || value === 'NaN') return '-';
  if (column === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  }
  return value;
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

/** True when any target overlaps the login's scope (same zone; whole zone on either side, or the same sector). */
export function instructionVisibleTo(targets: PolicePrintScope[], scope: PolicePrintScope[]): boolean {
  return targets.some(target => scope.some(area => area.zone === target.zone &&
    (area.sector === null || target.sector === null || area.sector === target.sector)));
}

/** "Zone 2: Venues (all sectors), Zone 5: … · Sector 1" */
export function describeTargets(targets: PolicePrintScope[]): string {
  const byZone = new Map<string, (string | null)[]>();
  for (const target of targets) byZone.set(target.zone, [...(byZone.get(target.zone) ?? []), target.sector]);
  return [...byZone.entries()].map(([zoneName, sectors]) => {
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
    const label = zone ? `Zone ${zone.number}: ${zone.name}` : zoneName;
    return sectors.includes(null) ? `${label} (all sectors)` : `${label} · ${sectors.join(', ')}`;
  }).join('; ');
}
