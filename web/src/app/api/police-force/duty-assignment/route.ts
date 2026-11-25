import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Please provide items array for duty assignment.' }, { status: 400 });
    }

    if (body.items.length > 5000) {
      return NextResponse.json({ error: 'Batch limit is 5000 items per assignment transaction.' }, { status: 400 });
    }

    const result = await services.passRepository.batchAssignPoliceDutyPostings(body.items, auth.user);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Duty assignment failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
