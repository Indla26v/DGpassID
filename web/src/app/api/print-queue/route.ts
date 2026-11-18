import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const options = {
    officeId: searchParams.get('office_id') || undefined,
    status: searchParams.get('status') || undefined,
    institution: searchParams.get('institution') || undefined,
    category: searchParams.get('category') || undefined,
    search: searchParams.get('search') || undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
    offset: parseInt(searchParams.get('offset') || '0', 10),
  };

  const result = await services.passRepository.list(options, true, auth.user);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const singleId = (body.id || '').toString().trim();
    let ids: string[] = [];

    if (singleId) {
      ids = [singleId];
    } else if (body.ids && Array.isArray(body.ids)) {
      ids = body.ids.map((id: unknown) => (id || '').toString().trim()).filter(Boolean);
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select 1–500 passes.' }, { status: 400 });
    }

    const { updated, successCount } = await services.passRepository.recordPrintAction(
      ids,
      auth.user,
      undefined,
      body.preview === true
    );

    if (singleId && body.preview !== true) {
      return NextResponse.json(updated[0]);
    }

    return NextResponse.json({ successCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Print action failed.';
    const isForbidden = message.includes('Only approved cards');
    const isNotFound = message.includes('not found');
    return NextResponse.json(
      { error: message },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
