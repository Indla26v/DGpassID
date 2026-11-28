import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { getCampaign, listCampaignRecipients } from '@/modules/messaging/messaging.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'SIMULATED']);

/** SP only: campaign progress and its recipients (optionally one status). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const status = new URL(req.url).searchParams.get('status')?.toUpperCase();
  const recipients = await listCampaignRecipients(id, status && STATUSES.has(status) ? status : undefined);
  return NextResponse.json({ campaign, recipients });
}
