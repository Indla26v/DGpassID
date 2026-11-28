/**
 * Messaging service — SMS template helpers for India's DLT rules (pure: no database, no network).
 *
 * The SP writes the message with named placeholders such as {name} or {zone}.
 * DLT-registered templates mark each variable as {#var#} (max 30 characters each), so the text
 * is converted to that form for approval, and the same order of variables is used when sending.
 */

export const PLACEHOLDERS = [
  { key: 'name', label: 'Officer name', sample: 'K. RAMESH' },
  { key: 'rank', label: 'Rank', sample: 'ASI/HC' },
  { key: 'police_id', label: 'Police ID', sample: '2364' },
  { key: 'event', label: 'Event name', sample: 'DGPs Conference 2026' },
  { key: 'event_dates', label: 'Event dates', sample: '27-30 Nov 2026' },
  { key: 'zone', label: 'Zone', sample: 'Zone 2: Venues' },
  { key: 'sector', label: 'Sector', sample: 'Sector 1: IISER' },
  { key: 'sub_sector', label: 'Sub-sector', sample: '1(A) IISER main gate' },
  { key: 'point', label: 'Duty point', sample: 'IISER main gate (west)' },
  { key: 'briefing_date', label: 'Briefing date', sample: '27 Nov 2026' },
  { key: 'briefing_time', label: 'Briefing time', sample: '4:00 PM' },
  { key: 'briefing_venue', label: 'Briefing venue', sample: 'IISER Auditorium' },
  // From the officer's duty passport (the active duty instruction for their sector, and the incharges page).
  { key: 'place_of_duty', label: 'Place of reporting', sample: 'IISER Tirupati' },
  { key: 'duty_period', label: 'Duty dates', sample: '03-12-2026 to 06-12-2026' },
  { key: 'report', label: 'First reporting', sample: 'Briefing 03-12-2026 08:00' },
  { key: 'report_place', label: 'First reporting place', sample: 'Police Parade Grounds' },
  { key: 'sector_incharge', label: 'Sector Incharge', sample: 'SP L SUBBARAYUDU' },
  { key: 'sector_incharge_phone', label: 'Sector Incharge phone', sample: '9440796700' },
  { key: 'sub_sector_incharge', label: 'Sub-sector Incharge', sample: 'Addl. SP A.SRINIVASULU' },
  { key: 'sub_sector_incharge_phone', label: 'Sub-sector Incharge phone', sample: '9912280333' },
  { key: 'local_officer', label: 'Local Officer', sample: 'DSP M. CHANDRA SEKHAR' },
  { key: 'local_officer_phone', label: 'Local Officer phone', sample: '6494058304' },
  { key: 'contact', label: 'Contact number', sample: '9000000000' },
  { key: 'signature', label: 'Signature', sample: 'SP Tirupati' },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]['key'];
export type MessageValues = Partial<Record<PlaceholderKey, string>>;

/** DLT limit for one variable. */
export const DLT_VAR_MAX = 30;
export const BLANK_VALUE = 'To be informed';
const KEYS = new Set<string>(PLACEHOLDERS.map(item => item.key));
const PATTERN = /\{([a-z_]+)\}/g;

/**
 * Default: the officer's duty details as a text SMS laid out one detail per line, in groups
 * (no incharge, Local Officer, contact number or signature). Fully editable in Messages.
 */
export const DEFAULT_TEMPLATE_BODY = [
  'Event: {event}',
  'Dates: {event_dates}',
  '',
  '{rank} {name}',
  'ID: {police_id}',
  '',
  'Zone: {zone}',
  'Sector: {sector}',
  'Sub-sector: {sub_sector}',
  'Point: {point}',
  '',
  'Place of reporting: {place_of_duty}',
  'Duty: {duty_period}',
  '',
  'Briefing: {briefing_date} {briefing_time}',
  'Venue: {briefing_venue}',
  '',
  'Report: {report}',
  'At: {report_place}',
  '',
  'Carry your Duty ID Card.',
].join('\n');

/** Every placeholder occurrence in order (DLT has one {#var#} per occurrence). Unknown names are ignored. */
export function placeholdersIn(body: string): PlaceholderKey[] {
  return [...body.matchAll(PATTERN)].map(match => match[1]).filter(key => KEYS.has(key)) as PlaceholderKey[];
}

/** Unknown {words} in the text (typos), so the editor can warn about them. */
export function unknownPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(PATTERN)].map(match => match[1]).filter(key => !KEYS.has(key)))];
}

/** Plain-ASCII text: typographic dashes/quotes would switch the SMS to Unicode (70 characters a part). */
export function toSmsText(value: string): string {
  return value
    .replace(/[–—−]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ');
}

/** One variable value as it will be sent: cleaned, no "|" (Fast2SMS separator), at most 30 characters. */
export function variableValue(values: MessageValues, key: PlaceholderKey): string {
  const raw = values[key]?.trim() ? values[key]!.trim() : BLANK_VALUE;
  const clean = toSmsText(raw).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return clean.length > DLT_VAR_MAX ? clean.slice(0, DLT_VAR_MAX).trimEnd() : clean;
}

/** Message as the officer will read it (with the same shortening the SMS will have). */
export function render(body: string, values: MessageValues): string {
  return toSmsText(body).replace(PATTERN, (whole, key: string) => (KEYS.has(key) ? variableValue(values, key as PlaceholderKey) : whole));
}

/** Text in DLT form ({#var#} for each placeholder) plus the variable order, for registration and sending. */
export function toDltTemplate(body: string): { text: string; order: PlaceholderKey[] } {
  const order = placeholdersIn(body);
  const text = toSmsText(body).replace(PATTERN, (whole, key: string) => (KEYS.has(key) ? '{#var#}' : whole));
  return { text, order };
}

/** Variable values in template order, as Fast2SMS expects them ("a|b|c"). */
export function buildVariables(order: readonly PlaceholderKey[], values: MessageValues): string {
  return order.map(key => variableValue(values, key)).join('|');
}

/** Placeholders whose value will be shortened to 30 characters for this officer. */
export function truncatedFields(order: readonly PlaceholderKey[], values: MessageValues): PlaceholderKey[] {
  return [...new Set(order)].filter(key => toSmsText(values[key]?.trim() ?? '').replace(/\s+/g, ' ').length > DLT_VAR_MAX);
}

const GSM7 = new Set(('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà').split(''));
const GSM7_EXTENDED = new Set('^{}\\[~]|€'.split(''));

/** Characters and SMS parts: 160/153 per part for plain text, 70/67 when any Unicode character is present. */
export function smsSegments(text: string): { characters: number; parts: number; unicode: boolean } {
  const chars = [...text];
  const unicode = chars.some(char => !GSM7.has(char) && !GSM7_EXTENDED.has(char));
  const characters = unicode ? chars.length : chars.reduce((sum, char) => sum + (GSM7_EXTENDED.has(char) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { characters, unicode, parts: characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / multi) };
}

/** Indian mobile to 91XXXXXXXXXX, or null when not a valid mobile. */
export function normalizeIndianMobile(raw?: string | null): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

export interface Briefing {
  zone: string;
  sector: string | null;
  briefing_date: string | null;
  briefing_time: string | null;
  venue: string | null;
}

/** Briefing for a posting: a sector override wins over the zone's briefing. */
export function briefingFor(briefings: readonly Briefing[], zone?: string | null, sector?: string | null): Briefing | undefined {
  if (!zone) return undefined;
  return briefings.find(item => item.zone === zone && sector && item.sector === sector)
    ?? briefings.find(item => item.zone === zone && !item.sector);
}

/** 2026-11-27 → "27 Nov 2026"; 16:00 → "4:00 PM". */
export function formatBriefingDate(value?: string | null): string {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatBriefingTime(value?: string | null): string {
  if (!value) return '';
  const [h, min] = value.split(':').map(Number);
  if (Number.isNaN(h)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(min || 0).padStart(2, '0')} ${suffix}`;
}

export const SAMPLE_VALUES: MessageValues = Object.fromEntries(PLACEHOLDERS.map(item => [item.key, item.sample]));
