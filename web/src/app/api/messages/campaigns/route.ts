import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { createCampaign, getMessageSettings, listCampaigns, prepareRecipients } from '@/modules/messaging/messaging.repository';
import { parseRecipientFilters } from '@/modules/messaging/filters';
import { toDltTemplate } from '@/modules/messaging/template';
import { smsConfig } from '@/modules/messaging/sms.client';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  return NextResponse.json({ campaigns: await listCampaigns() });
}

/** SP only: snapshots the recipients for a send. Sending happens in batches via send-next. */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const body = await req.json();
    const filters = parseRecipientFilters(body);
    if (typeof filters === 'string') return NextResponse.json({ error: filters }, { status: 400 });
    const config = smsConfig();
    if (!config.dryRun && !config.configured) {
      return NextResponse.json({ error: 'SMS is not configured. Add the Fast2SMS API key, sender ID and DLT message ID, or keep dry run on.' }, { status: 400 });
    }
    const [{ recipients }, settings] = await Promise.all([prepareRecipients(filters), getMessageSettings()]);
    if (!recipients.length) return NextResponse.json({ error: 'No allotted officers match these filters.' }, { status: 400 });
    if (Number.isInteger(body.expectedCount) && body.expectedCount !== recipients.length) {
      return NextResponse.json({ error: 'The recipient list changed since the preview. Check the count and send again.' }, { status: 409 });
    }
    const { order } = toDltTemplate(settings.templateBody);
    const id = await createCampaign({
      actor: auth.user.email,
      filters,
      dltMessageId: config.messageId,
      senderId: config.senderId,
      body: settings.templateBody,
      order,
      dryRun: config.dryRun,
      recipients,
    });
    return NextResponse.json({ id, total: recipients.length, dryRun: config.dryRun }, { status: 201 });
  } catch (error) {
    console.error('Campaign create error:', error);
    return NextResponse.json({ error: 'Could not create the send.' }, { status: 500 });
  }
}
