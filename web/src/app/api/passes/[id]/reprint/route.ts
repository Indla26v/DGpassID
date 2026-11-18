import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = (body.reason || '').toString().trim();

    if (reason.length < 3 || reason.length > 500) {
      return NextResponse.json({ error: 'Enter a reprint reason of 3–500 characters.' }, { status: 400 });
    }

    const { updated } = await services.passRepository.recordPrintAction([id], auth.user, reason);
    return NextResponse.json(updated[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record reprint.';
    const isForbidden = message.includes('Only approved cards');
    return NextResponse.json({ error: message }, { status: isForbidden ? 403 : message.endsWith('not found.') ? 404 : 400 });
  }
}
