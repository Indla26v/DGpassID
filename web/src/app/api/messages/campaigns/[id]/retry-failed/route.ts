import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { getCampaign, retryFailed } from '@/modules/messaging/messaging.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SP only: queues failed recipients again; the screen then resumes send-next. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const requeued = await retryFailed(id);
  return NextResponse.json({ requeued, campaign: await getCampaign(id) });
}
