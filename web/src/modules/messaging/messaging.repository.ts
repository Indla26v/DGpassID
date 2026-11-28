/**
 * Messaging service — settings, zone briefings, campaigns and recipients.
 * Recipients are a snapshot taken when a campaign is created, so later postings
 * do not change what a running campaign sends.
 */
import { query, withTransaction } from '@/infrastructure/db/pool';
import { POLICE_BANDOBUSHT_ZONES, resolveDutyPosting } from '@/core/domain/police-zones';
import { displayRank } from '@/core/domain/ranks';
import { listOfficersForExport, type PoliceExportFilters, type PoliceExportRow } from '@/modules/deployment/deployment.repository';
import { displayDate, formatEntryCell, type InstructionEntry, type InstructionTarget } from '@/core/domain/duty-instructions';
import { passportIncharges, type InchargeAllotment, type SectorOfficer, type ZoneAccount } from '@/core/domain/duty-passport';
import { currentIncharges } from '@/modules/deployment/incharges.repository';
import { listLocalOfficers } from '@/modules/deployment/local-officers.repository';
import { listSectorSeniors, listZoneAccounts } from '@/modules/deployment/passports.repository';
import {
  briefingFor, DEFAULT_TEMPLATE_BODY, formatBriefingDate, formatBriefingTime, normalizeIndianMobile,
  type Briefing, type MessageValues, type PlaceholderKey,
} from './template';

export interface MessageSettings {
  eventName: string;
  eventDates: string;
  contact: string;
  signature: string;
  templateBody: string;
}

const SETTING_KEYS: Record<keyof MessageSettings, string> = {
  eventName: 'msg_event_name',
  eventDates: 'msg_event_dates',
  contact: 'msg_contact_number',
  signature: 'msg_signature',
  templateBody: 'msg_template_body',
};

const DEFAULT_SETTINGS: MessageSettings = {
  eventName: process.env.NEXT_PUBLIC_CONFERENCE_NAME?.trim() || 'DGPs Conference 2026',
  eventDates: process.env.NEXT_PUBLIC_CONFERENCE_DATES?.trim() || '',
  contact: '',
  signature: 'SP Tirupati Police',
  templateBody: DEFAULT_TEMPLATE_BODY,
};

export async function getMessageSettings(): Promise<MessageSettings> {
  const res = await query<{ key: string; value: string }>(
    'SELECT key, value FROM conference_configs WHERE key = ANY($1::text[])', [Object.values(SETTING_KEYS)]);
  const stored = new Map(res.rows.map(row => [row.key, row.value]));
  const settings = { ...DEFAULT_SETTINGS };
  for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof MessageSettings, string][]) {
    if (stored.has(key)) settings[field] = stored.get(key)!;
  }
  return settings;
}

export async function saveMessageSettings(settings: MessageSettings): Promise<void> {
  await withTransaction(async client => {
    for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof MessageSettings, string][]) {
      await client.query(
        `INSERT INTO conference_configs (key, value, description) VALUES ($1, $2, 'SMS duty message setting')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, settings[field]],
      );
    }
  });
}

export async function listBriefings(): Promise<Briefing[]> {
  const res = await query<Briefing>(
    `SELECT zone, sector, briefing_date::text AS briefing_date, to_char(briefing_time, 'HH24:MI') AS briefing_time, venue
       FROM zone_briefings ORDER BY zone, sector NULLS FIRST`);
  return res.rows;
}

/** Replaces all briefings with the given list (empty rows dropped). */
export async function saveBriefings(briefings: Briefing[], actor: string): Promise<void> {
  await withTransaction(async client => {
    await client.query('DELETE FROM zone_briefings');
    for (const item of briefings) {
      if (!item.briefing_date && !item.briefing_time && !item.venue) continue;
      await client.query(
        `INSERT INTO zone_briefings (zone, sector, briefing_date, briefing_time, venue, updated_by)
         VALUES ($1, $2, $3::date, $4::time, $5, $6)`,
        [item.zone, item.sector || null, item.briefing_date || null, item.briefing_time || null, item.venue?.trim() || null, actor],
      );
    }
  });
}

export interface RecipientFilters {
  zone?: string;
  sectorNumber?: string;
  districts: string[];
  ranks: string[];
  onlyOnPoint: boolean;
}

export interface PreparedRecipient {
  passId: string;
  fullName: string;
  mobile: string | null;
  rawMobile: string;
  values: MessageValues;
  skipReason?: string;
}

/** What the duty passport needs: active instructions and the incharge / Local Officer allotments. */
interface PassportContext {
  instructions: { targets: InstructionTarget[]; entries: InstructionEntry[]; duty_from: string | null; duty_to: string | null; place_of_duty: string | null }[];
  accounts: ZoneAccount[];
  allotments: InchargeAllotment[];
  seniors: SectorOfficer[];
  locals: InchargeAllotment[];
}

async function loadPassportContext(zones: string[]): Promise<PassportContext> {
  const [instructions, accounts, allotments, seniors, locals] = await Promise.all([
    query<PassportContext['instructions'][number]>(
      `SELECT targets, entries, duty_from::text AS duty_from, duty_to::text AS duty_to, place_of_duty
         FROM duty_instructions WHERE status = 'ACTIVE' ORDER BY updated_at DESC`).then(res => res.rows),
    listZoneAccounts(), currentIncharges(zones), listSectorSeniors(zones), listLocalOfficers(zones),
  ]);
  return { instructions, accounts, allotments, seniors, locals };
}

/** "SP L SUBBARAYUDU (9440796700)" -> ["SP L SUBBARAYUDU", "9440796700"]; "Not Assigned" stays as the name. */
const splitPhone = (label: string | null | undefined): [string, string] => {
  const match = /^(.*?)\s*\((\d{6,})\)\s*$/.exec(label ?? '');
  return match ? [match[1], match[2]] : [label ?? '', ''];
};

/** Duty passport values: the newest active instruction covering the officer's sector / sub-sector, and the footer names. */
function passportValuesFor(row: PoliceExportRow, context: PassportContext, subSector: string | null): MessageValues {
  const instruction = context.instructions.find(item => item.targets.some(target => target.zone === row.police_zone &&
    (target.sector === null || (target.sector === row.police_sector_number && (!target.subSector || target.subSector === subSector)))));
  const footer = passportIncharges(
    { police_zone: row.police_zone, police_sector_number: row.police_sector_number, police_sector_name: row.police_sector_name },
    context.accounts, context.allotments, context.seniors, context.locals,
  );
  const [sectorIncharge, sectorPhone] = splitPhone(footer.sectorIncharge);
  const [subIncharge, subPhone] = splitPhone(footer.subSectorIncharge);
  const [local, localPhone] = splitPhone(footer.localOfficers[0]);
  // The schedule's "Place of Reporting" row gives the place of reporting; other rows give the first reporting.
  const isPlaceRow = (entity?: string) => (entity ?? '').trim().toLowerCase() === 'place of reporting';
  const placeRow = instruction?.entries.find(entry => isPlaceRow(entry.entity));
  const first = instruction?.entries.find(entry => entry.entity?.trim() && !isPlaceRow(entry.entity));
  const from = instruction?.duty_from ? displayDate(instruction.duty_from) : '';
  const to = instruction?.duty_to && instruction.duty_to !== instruction.duty_from ? displayDate(instruction.duty_to) : '';
  return {
    place_of_duty: placeRow?.place?.trim() || instruction?.place_of_duty || '',
    duty_period: from && to ? `${from} to ${to}` : from,
    report: first ? [first.entity.trim(), first.date ? formatEntryCell('date', first) : '', first.time ? formatEntryCell('time', first) : ''].filter(Boolean).join(' ') : '',
    report_place: first?.place?.trim() ?? '',
    sector_incharge: sectorIncharge,
    sector_incharge_phone: sectorPhone,
    sub_sector_incharge: subIncharge,
    sub_sector_incharge_phone: subPhone,
    local_officer: local,
    local_officer_phone: localPhone,
  };
}

function valuesFor(row: PoliceExportRow, settings: MessageSettings, briefings: Briefing[], context: PassportContext): MessageValues {
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === row.police_zone);
  const posting = resolveDutyPosting(row.police_zone, row.police_sector_number, row.police_sector_name);
  const sectorName = posting.sector?.name ?? (row.police_sector_name || '');
  const briefing = briefingFor(briefings, row.police_zone, row.police_sector_number);
  return {
    name: row.full_name,
    rank: displayRank(row.rank),
    police_id: row.police_id_number ?? '',
    event: settings.eventName,
    event_dates: settings.eventDates,
    zone: zone ? `Zone ${zone.number}: ${zone.name}` : row.police_zone ?? '',
    sector: row.police_sector_number ? `${row.police_sector_number}: ${sectorName}` : '',
    sub_sector: posting.subSector ?? '',
    point: row.police_point_name ?? '',
    briefing_date: formatBriefingDate(briefing?.briefing_date),
    briefing_time: formatBriefingTime(briefing?.briefing_time),
    briefing_venue: briefing?.venue ?? '',
    contact: settings.contact,
    signature: settings.signature,
    ...passportValuesFor(row, context, posting.subSector ?? null),
  };
}

/** Allotted officers matching the filters, with their filled message values. */
export async function prepareRecipients(filters: RecipientFilters, limit = 20000): Promise<{ total: number; recipients: PreparedRecipient[] }> {
  const exportFilters: PoliceExportFilters = {
    zone: filters.zone,
    sectorNumber: filters.sectorNumber,
    districts: filters.districts,
    ranks: filters.ranks,
    duty: filters.onlyOnPoint ? 'ON_POINT' : 'ALLOTTED',
  };
  const [{ total, rows }, settings, briefings] = await Promise.all([
    listOfficersForExport(exportFilters, limit), getMessageSettings(), listBriefings(),
  ]);
  const context = await loadPassportContext([...new Set(rows.map(row => row.police_zone).filter((zone): zone is string => Boolean(zone)))]);
  const recipients = rows.map(row => {
    const mobile = normalizeIndianMobile(row.mobile_number);
    return {
      passId: row.id,
      fullName: row.full_name,
      mobile,
      rawMobile: row.mobile_number ?? '',
      values: valuesFor(row, settings, briefings, context),
      skipReason: mobile ? undefined : row.mobile_number ? 'Not a valid Indian mobile number' : 'No mobile number',
    };
  });
  return { total, recipients };
}

export interface CampaignSummary {
  id: string;
  created_by: string;
  created_at: string;
  dlt_message_id: string;
  sender_id: string;
  dry_run: boolean;
  status: 'SENDING' | 'DONE' | 'CANCELLED';
  filters: unknown;
  total: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  simulated: number;
}

const COUNTS = `
  COUNT(r.id)::int AS total,
  COUNT(r.id) FILTER (WHERE r.status IN ('QUEUED', 'SENDING'))::int AS queued,
  COUNT(r.id) FILTER (WHERE r.status IN ('SENT', 'DELIVERED', 'READ'))::int AS sent,
  COUNT(r.id) FILTER (WHERE r.status = 'FAILED')::int AS failed,
  COUNT(r.id) FILTER (WHERE r.status = 'SKIPPED')::int AS skipped,
  COUNT(r.id) FILTER (WHERE r.status = 'SIMULATED')::int AS simulated`;

export async function createCampaign(input: {
  actor: string;
  filters: RecipientFilters;
  dltMessageId: string;
  senderId: string;
  body: string;
  order: PlaceholderKey[];
  dryRun: boolean;
  recipients: PreparedRecipient[];
}): Promise<string> {
  return withTransaction(async client => {
    const campaign = await client.query<{ id: string }>(
      `INSERT INTO message_campaigns (created_by, filters, dlt_message_id, sender_id, body_snapshot, param_order, dry_run)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.actor, JSON.stringify(input.filters), input.dltMessageId, input.senderId, input.body, JSON.stringify(input.order), input.dryRun],
    );
    const id = campaign.rows[0].id;
    const rows = input.recipients.map(item => ({
      pass_id: item.passId, full_name: item.fullName, mobile_e164: item.mobile, params: item.values,
      status: item.mobile ? 'QUEUED' : 'SKIPPED', error: item.skipReason ?? null,
    }));
    for (let offset = 0; offset < rows.length; offset += 1000) {
      await client.query(
        `INSERT INTO message_recipients (campaign_id, pass_id, full_name, mobile_e164, params, status, error)
         SELECT $1, r.pass_id, r.full_name, r.mobile_e164, r.params, r.status, r.error
           FROM jsonb_to_recordset($2::jsonb) AS r(pass_id uuid, full_name text, mobile_e164 text, params jsonb, status text, error text)`,
        [id, JSON.stringify(rows.slice(offset, offset + 1000))],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, user_role, details)
       VALUES ('SMS_CAMPAIGN_CREATED', $1, 'ADMIN', $2)`,
      [input.actor, `SMS send ${id}: ${rows.length} recipients (${rows.filter(row => row.status === 'SKIPPED').length} skipped), DLT message ${input.dltMessageId || '(not set)'}${input.dryRun ? ', dry run' : ''}.`],
    );
    return id;
  });
}

export async function getCampaign(id: string): Promise<(CampaignSummary & { body_snapshot: string; param_order: PlaceholderKey[] }) | null> {
  const res = await query<CampaignSummary & { body_snapshot: string; param_order: PlaceholderKey[] }>(
    `SELECT c.id, c.created_by, c.created_at, c.dlt_message_id, c.sender_id, c.dry_run, c.status, c.filters,
            c.body_snapshot, c.param_order, ${COUNTS}
       FROM message_campaigns c LEFT JOIN message_recipients r ON r.campaign_id = c.id
      WHERE c.id = $1 GROUP BY c.id`, [id]);
  return res.rows[0] ?? null;
}

export async function listCampaigns(limit = 50): Promise<CampaignSummary[]> {
  const res = await query<CampaignSummary>(
    `SELECT c.id, c.created_by, c.created_at, c.dlt_message_id, c.sender_id, c.dry_run, c.status, c.filters, ${COUNTS}
       FROM message_campaigns c LEFT JOIN message_recipients r ON r.campaign_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT $1`, [limit]);
  return res.rows;
}

export interface QueuedRecipient {
  id: string;
  mobile_e164: string;
  params: MessageValues;
}

/** Claims up to `size` queued recipients (marked SENDING) so parallel calls never double-send. */
export async function claimNextBatch(campaignId: string, size: number): Promise<QueuedRecipient[]> {
  const res = await query<QueuedRecipient>(
    `UPDATE message_recipients SET status = 'SENDING', status_at = NOW()
      WHERE id IN (
        SELECT r.id FROM message_recipients r JOIN message_campaigns c ON c.id = r.campaign_id
         WHERE r.campaign_id = $1 AND r.status = 'QUEUED' AND c.status = 'SENDING'
         ORDER BY r.id LIMIT $2 FOR UPDATE OF r SKIP LOCKED)
      RETURNING id::text, mobile_e164, params`, [campaignId, size]);
  return res.rows;
}

export async function recordSendResults(results: { id: string; status: 'SENT' | 'SIMULATED' | 'FAILED'; messageId?: string; error?: string }[]): Promise<void> {
  if (!results.length) return;
  await query(
    `UPDATE message_recipients r
        SET status = u.status, provider_message_id = u.message_id, error = u.error,
            sent_at = CASE WHEN u.status <> 'FAILED' THEN NOW() ELSE r.sent_at END, status_at = NOW()
       FROM jsonb_to_recordset($1::jsonb) AS u(id bigint, status text, message_id text, error text)
      WHERE r.id = u.id`,
    [JSON.stringify(results.map(item => ({ id: item.id, status: item.status, message_id: item.messageId ?? null, error: item.error ?? null })))],
  );
}

/** Marks the campaign DONE once nothing is queued or in flight. */
export async function finishIfComplete(campaignId: string): Promise<void> {
  await query(
    `UPDATE message_campaigns SET status = 'DONE', finished_at = NOW()
      WHERE id = $1 AND status = 'SENDING'
        AND NOT EXISTS (SELECT 1 FROM message_recipients WHERE campaign_id = $1 AND status IN ('QUEUED', 'SENDING'))`,
    [campaignId]);
}

export async function cancelCampaign(campaignId: string): Promise<void> {
  await withTransaction(async client => {
    await client.query(`UPDATE message_campaigns SET status = 'CANCELLED', finished_at = NOW() WHERE id = $1 AND status = 'SENDING'`, [campaignId]);
    await client.query(`UPDATE message_recipients SET status = 'SKIPPED', error = 'Campaign cancelled', status_at = NOW()
                         WHERE campaign_id = $1 AND status = 'QUEUED'`, [campaignId]);
  });
}

/** Puts failed recipients back in the queue and reopens the campaign. */
export async function retryFailed(campaignId: string): Promise<number> {
  return withTransaction(async client => {
    const res = await client.query(
      `UPDATE message_recipients SET status = 'QUEUED', error = NULL, status_at = NOW()
        WHERE campaign_id = $1 AND status = 'FAILED' AND mobile_e164 IS NOT NULL`, [campaignId]);
    if (res.rowCount) await client.query(`UPDATE message_campaigns SET status = 'SENDING', finished_at = NULL WHERE id = $1`, [campaignId]);
    return res.rowCount ?? 0;
  });
}

export async function listCampaignRecipients(campaignId: string, status?: string, limit = 500) {
  const params: unknown[] = [campaignId];
  let where = 'campaign_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  params.push(limit);
  const res = await query<{ id: string; full_name: string; mobile_e164: string | null; status: string; error: string | null; sent_at: string | null; params: MessageValues }>(
    `SELECT id::text, full_name, mobile_e164, status, error, sent_at, params FROM message_recipients
      WHERE ${where} ORDER BY id LIMIT $${params.length}`, params);
  return res.rows;
}
