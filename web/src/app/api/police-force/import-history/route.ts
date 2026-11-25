import { NextResponse } from 'next/server';
import { canImportDistrictProforma } from '@/core/domain/offices';
import type { RosterImportHistoryEntry, RosterImportSummary } from '@/core/domain/roster-import-history';
import { services } from '@/core/services/service-container';
import { query } from '@/infrastructure/db/pool';
import { authorizeRequest } from '@/lib/auth/session-helper';

const action = 'POLICE_ROSTER_IMPORT';

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
    const history: RosterImportHistoryEntry[] = rows.map(row => ({
      ...JSON.parse(row.details) as RosterImportSummary,
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
  const { filename, detected, created, updated, needsReview, skipped, resume } = body ?? {};
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 ||
      !isCount(detected) || !detected || !isCount(created) || !isCount(updated) ||
      !isCount(needsReview) || !isCount(skipped) || created + updated + needsReview + skipped > detected) {
    return NextResponse.json({ error: 'Invalid import summary.' }, { status: 400 });
  }
  const summary: RosterImportSummary = { filename: filename.trim(), detected, created, updated, needsReview, skipped };
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
