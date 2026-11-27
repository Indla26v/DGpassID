import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { unallotOfficers } from '@/modules/deployment/deployment.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sends officers back to Officer Selection by removing their zone, sector, sub-sector and point.
 * SP: any officer. Zone / sector officer: only officers inside their own zone or sector.
 */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const passIds: string[] = Array.isArray(body.passIds) ? [...new Set<string>(body.passIds)] : [];
    if (!passIds.length || passIds.length > 2000 || passIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
      return NextResponse.json({ error: 'Select between 1 and 2000 officers.' }, { status: 400 });
    }
    const result = await unallotOfficers(passIds, auth.user);
    if (!result.returned) {
      return NextResponse.json({ error: 'None of the selected officers are allotted inside your area.' }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Send back to selection error:', error);
    return NextResponse.json({ error: 'Could not send the officers back.' }, { status: 500 });
  }
}
