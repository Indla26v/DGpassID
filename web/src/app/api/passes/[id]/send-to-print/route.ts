import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const updated = await services.passRepository.sendToPrintTeam(id, auth.user);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send pass to print team.';
    const isForbidden = message.includes('Only draft, approved or pending');
    return NextResponse.json({ error: message }, { status: isForbidden ? 403 : message === 'Pass not found.' ? 404 : 400 });
  }
}
