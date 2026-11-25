import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;
  const { id } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Police pass not found.' }, { status: 404 });
  }
  try {
    return NextResponse.json(await services.passRepository.issuePolicePass(id, auth.user));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Police pass not found.') return NextResponse.json({ error: message }, { status: 404 });
    if (message === 'Confirm a successful print before issuing the badge.') {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not issue the badge. Try again.' }, { status: 500 });
  }
}
