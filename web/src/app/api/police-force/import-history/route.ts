import { NextResponse } from 'next/server';
import { canImportDistrictProforma } from '@/core/domain/offices';
import {
  MAX_FLAGGED_ROWS, MAX_PENDING_ROWS, PENDING_FIELDS, type FlaggedImportRow, type PendingImportRow,
  type PersonnelImportHistoryEntry, type PersonnelImportSummary,
} from '@/core/domain/personnel-import-history';
import { services } from '@/core/services/service-container';
import { query } from '@/infrastructure/db/pool';
import { authorizeRequest } from '@/lib/auth/session-helper';

const action = 'POLICE_PERSONNEL_IMPORT';

/** Held-back rows as sent by the import screen: known fields only, short text values. */
function parsePending(value: unknown, limit: number): PendingImportRow[] | null {
  if (!Array.isArray(value) || value.length > Math.min(limit, MAX_PENDING_ROWS)) return null;
  const rows: PendingImportRow[] = [];
  for (const item of value) {
    if (!item || !Number.isInteger(item.row) || item.row < 2 || item.row > 1_048_576 || typeof item.reason !== 'string' || !item.record || typeof item.record !== 'object') return null;
    const record: PendingImportRow['record'] = {};
    for (const field of PENDING_FIELDS) {
      const text = item.record[field];
      if (text === undefined || text === null || text === '') continue;
      if (typeof text !== 'string' || text.length > 255) return null;
      record[field] = text;
    }
    rows.push({ row: item.row, reason: item.reason.slice(0, 300), record });
  }
  return new Set(rows.map(row => row.row)).size === rows.length ? rows : null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5000;
}

function isRowList(value: unknown, limit: number): value is number[] {
  return Array.isArray(value) && value.length <= limit && new Set(value).size === value.length &&
    value.every(row => Number.isInteger(row) && row >= 2 && row <= 1_048_576);
}

export async function GET(req: Request) {
  const { user, errorResponse } = await authorizeRequest(req, ['ADMIN']);
  if (errorResponse) return errorResponse;
  if (!canImportDistrictProforma(user)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

  try {
    const { rows } = await query<{ id: number; created_at: string; performed_by: string; details: string }>(
      'SELECT id, created_at, performed_by, details FROM audit_logs WHERE action = $1 ORDER BY created_at DESC, id DESC LIMIT 100',
      [action],
    );
    const history: PersonnelImportHistoryEntry[] = rows.map(row => ({
      ...JSON.parse(row.details) as PersonnelImportSummary,
      id: row.id,
      createdAt: row.created_at,
      importedBy: row.performed_by,
    }));
    return NextResponse.json({ history }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load import history.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, errorResponse } = await authorizeRequest(req, ['ADMIN']);
  if (errorResponse) return errorResponse;
  if (!canImportDistrictProforma(user)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { filename, detected, created, updated, needsReview, skipped, resume, flagged, pending } = body ?? {};
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 ||
      !isCount(detected) || !detected || !isCount(created) || !isCount(updated) ||
      !isCount(needsReview) || !isCount(skipped) || created + updated + needsReview + skipped > detected) {
    return NextResponse.json({ error: 'Invalid import summary.' }, { status: 400 });
  }
  const summary: PersonnelImportSummary = { filename: filename.trim(), detected, created, updated, needsReview, skipped };
  if (flagged !== undefined) {
    const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
    const valid = Array.isArray(flagged) && flagged.length <= Math.min(detected, MAX_FLAGGED_ROWS) && flagged.every((item: FlaggedImportRow) =>
      item && Number.isInteger(item.row) && item.row >= 2 && item.row <= 1_048_576 && text(item.name, 200) && text(item.policeId, 64) &&
      Array.isArray(item.issues) && item.issues.length >= 1 && item.issues.length <= 6 && item.issues.every(issue => text(issue, 300)));
    if (!valid) return NextResponse.json({ error: 'Invalid list of rows to review.' }, { status: 400 });
    summary.flagged = (flagged as FlaggedImportRow[]).map(({ row, name, policeId, issues }) => ({ row, name, policeId, issues }));
  }
  if (pending !== undefined) {
    const rows = parsePending(pending, needsReview);
    if (!rows) return NextResponse.json({ error: 'Invalid list of rows held back.' }, { status: 400 });
    if (rows.length) summary.pending = rows;
  }
  if (resume !== undefined) {
    if (!resume || typeof resume.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(resume.fingerprint) ||
        !isRowList(resume.importedRows, detected) || !isRowList(resume.skippedRows, detected) ||
        resume.skippedRows.length !== skipped || resume.importedRows.length < created + updated ||
        resume.importedRows.length + skipped + needsReview !== detected ||
        new Set([...resume.importedRows, ...resume.skippedRows]).size !== resume.importedRows.length + skipped) {
      return NextResponse.json({ error: 'Invalid import review progress.' }, { status: 400 });
    }
    summary.resume = {
      fingerprint: resume.fingerprint,
      importedRows: resume.importedRows,
      skippedRows: resume.skippedRows,
    };
  }
  try {
    await services.auditRepository.createLog({
      action,
      performed_by: user.email,
      user_role: user.role,
      details: JSON.stringify(summary),
    });
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not save import history.' }, { status: 500 });
  }
}

/**
 * After held-back rows are corrected and imported from Re-review: { id, importedRows: [sheet rows], pending: [rows still
 * held back, with updated details], created, updated }. Updates that history entry's counts and remaining rows.
 */
export async function PATCH(req: Request) {
  const { user, errorResponse } = await authorizeRequest(req, ['ADMIN']);
  if (errorResponse) return errorResponse;
  if (!canImportDistrictProforma(user)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1 || !isCount(body?.created) || !isCount(body?.updated)) {
    return NextResponse.json({ error: 'Invalid review update.' }, { status: 400 });
  }
  try {
    const { rows } = await query<{ details: string }>('SELECT details FROM audit_logs WHERE id = $1 AND action = $2', [id, action]);
    if (!rows[0]) return NextResponse.json({ error: 'Import history entry not found.' }, { status: 404 });
    const summary = JSON.parse(rows[0].details) as PersonnelImportSummary;
    const before = summary.pending ?? [];
    const known = new Set(before.map(row => row.row));
    const importedRows: number[] = Array.isArray(body.importedRows) ? body.importedRows : [];
    const remaining = parsePending(body.pending ?? [], before.length);
    if (!remaining || importedRows.some(row => !known.has(row)) || remaining.some(row => !known.has(row.row) || importedRows.includes(row.row))) {
      return NextResponse.json({ error: 'These rows do not belong to this import.' }, { status: 400 });
    }
    const imported = new Set(importedRows);
    summary.pending = remaining.length ? remaining : undefined;
    // Flags from rows imported in Re-review join the entry's flagged list (replacing an older flag for the same row).
    const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
    const newFlags: FlaggedImportRow[] = (Array.isArray(body.flagged) ? body.flagged : [])
      .filter((item: FlaggedImportRow) => item && imported.has(item.row) && text(item.name, 200) && text(item.policeId, 64)
        && Array.isArray(item.issues) && item.issues.length >= 1 && item.issues.length <= 6 && item.issues.every(issue => text(issue, 300)))
      .map(({ row, name, policeId, issues }: FlaggedImportRow) => ({ row, name, policeId, issues }));
    if (newFlags.length) {
      const replaced = new Set(newFlags.map(item => item.row));
      summary.flagged = [...(summary.flagged ?? []).filter(item => !replaced.has(item.row)), ...newFlags]
        .sort((a, b) => a.row - b.row).slice(0, MAX_FLAGGED_ROWS);
    }
    summary.created += body.created;
    summary.updated += body.updated;
    summary.needsReview = Math.max(0, summary.needsReview - imported.size);
    if (summary.resume) summary.resume.importedRows = [...new Set([...summary.resume.importedRows, ...imported])];
    await query('UPDATE audit_logs SET details = $1 WHERE id = $2 AND action = $3', [JSON.stringify(summary), id, action]);
    return NextResponse.json({ saved: true, entry: summary });
  } catch {
    return NextResponse.json({ error: 'Could not update import history.' }, { status: 500 });
  }
}
