import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { claimNextBatch, finishIfComplete, getCampaign, recordSendResults } from '@/modules/messaging/messaging.repository';
import { buildVariables } from '@/modules/messaging/template';
import { sendDltSms, smsConfig } from '@/modules/messaging/sms.client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 25;
const PARALLEL = 5;

/** SP only: sends the next batch of a campaign and returns progress. The screen calls this until done. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  try {
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    // Send with the DLT message and sender ID the campaign was created with.
    const current = smsConfig();
    const config = { ...current, senderId: campaign.sender_id || current.senderId, messageId: campaign.dlt_message_id || current.messageId };
    config.configured = current.configured && Boolean(config.senderId && config.messageId);
    // A campaign created as a dry run stays a dry run even if the setting changes later.
    if (campaign.dry_run) config.dryRun = true;
    if (!config.dryRun && !config.configured) {
      return NextResponse.json({ error: 'SMS is not configured. Add the Fast2SMS API key, sender ID and DLT message ID.' }, { status: 400 });
    }

    const batch = await claimNextBatch(id, BATCH);
    const results: { id: string; status: 'SENT' | 'SIMULATED' | 'FAILED'; messageId?: string; error?: string }[] = [];
    for (let i = 0; i < batch.length; i += PARALLEL) {
      const chunk = batch.slice(i, i + PARALLEL);
      const sent = await Promise.all(chunk.map(item => sendDltSms(item.mobile_e164, buildVariables(campaign.param_order, item.params), config)));
      sent.forEach((result, index) => results.push(result.ok
        ? { id: chunk[index].id, status: result.simulated ? 'SIMULATED' : 'SENT', messageId: result.requestId }
        : { id: chunk[index].id, status: 'FAILED', error: result.error }));
    }
    await recordSendResults(results);
    await finishIfComplete(id);
    const progress = await getCampaign(id);
    return NextResponse.json({ processed: results.length, campaign: progress });
  } catch (error) {
    console.error('Campaign send error:', error);
    return NextResponse.json({ error: 'Sending stopped. Try again to continue.' }, { status: 500 });
  }
}
