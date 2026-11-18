import { NextResponse } from 'next/server';
import { officeScope } from '@/core/domain/offices';
import { query } from '@/infrastructure/db/pool';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const passId = searchParams.get('passId')?.trim();
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 30;

  const scopedLogs = `SELECT a.* FROM audit_logs a LEFT JOIN passes p ON p.id = a.pass_id
    WHERE pass_office_visible($1, COALESCE(a.office_id, p.office_id))`;
  const scope = officeScope(auth.user);
  const { rows } = passId
    ? await query(scopedLogs + ' AND a.pass_id = $2 ORDER BY a.created_at DESC LIMIT 500', [scope, passId])
    : await query(scopedLogs + ' ORDER BY a.created_at DESC LIMIT $2', [scope, Math.min(Math.max(limit || 30, 1), 500)]);
  return NextResponse.json(rows);
}
