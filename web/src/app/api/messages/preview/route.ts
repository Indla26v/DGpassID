import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { getMessageSettings, prepareRecipients } from '@/modules/messaging/messaging.repository';
import { parseRecipientFilters } from '@/modules/messaging/filters';
import { render, smsSegments, toDltTemplate, truncatedFields, type PlaceholderKey } from '@/modules/messaging/template';

/** SP only: who a send would reach, who would be skipped, SMS parts, shortened fields and sample messages. */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const body = await req.json();
    const filters = parseRecipientFilters(body);
    if (typeof filters === 'string') return NextResponse.json({ error: filters }, { status: 400 });
    const [{ total, recipients }, settings] = await Promise.all([prepareRecipients(filters), getMessageSettings()]);
    const template = typeof body.templateBody === 'string' && body.templateBody.trim() ? body.templateBody : settings.templateBody;
    const skipped = recipients.filter(item => !item.mobile);
    const sendable = recipients.filter(item => item.mobile);
    const { order } = toDltTemplate(template);
    let totalParts = 0;
    let maxParts = 0;
    const shortened: Partial<Record<PlaceholderKey, number>> = {};
    for (const item of sendable) {
      const { parts } = smsSegments(render(template, item.values));
      totalParts += parts;
      maxParts = Math.max(maxParts, parts);
      for (const key of truncatedFields(order, item.values)) shortened[key] = (shortened[key] ?? 0) + 1;
    }
    return NextResponse.json({
      total,
      sendable: recipients.length - skipped.length,
      skipped: skipped.slice(0, 200).map(item => ({ name: item.fullName, mobile: item.rawMobile, reason: item.skipReason })),
      skippedCount: skipped.length,
      totalParts,
      maxParts,
      shortened,
      samples: sendable.slice(0, 5).map(item => ({
        name: item.fullName, mobile: item.mobile, message: render(template, item.values),
      })),
    });
  } catch (error) {
    console.error('Message preview error:', error);
    return NextResponse.json({ error: 'Could not prepare the preview.' }, { status: 500 });
  }
}
