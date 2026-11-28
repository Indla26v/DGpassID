import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { services } from '@/core/services/service-container';
import { getMessageSettings, listBriefings, saveBriefings, saveMessageSettings } from '@/modules/messaging/messaging.repository';
import { toDltTemplate, unknownPlaceholders } from '@/modules/messaging/template';
import { smsConfig } from '@/modules/messaging/sms.client';

/** SP only: message settings, zone briefings and the SMS connection state (never the API key). */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const [settings, briefings] = await Promise.all([getMessageSettings(), listBriefings()]);
  const config = smsConfig();
  return NextResponse.json({
    settings,
    briefings,
    sms: { dryRun: config.dryRun, configured: config.configured, provider: config.provider, senderId: config.senderId, messageId: config.messageId },
    dlt: toDltTemplate(settings.templateBody),
  });
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export async function PUT(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const body = await req.json();
    const s = body.settings ?? {};
    const templateBody = typeof s.templateBody === 'string' ? s.templateBody.slice(0, 640) : '';
    if (!templateBody.trim()) return NextResponse.json({ error: 'Write the message text.' }, { status: 400 });
    const unknown = unknownPlaceholders(templateBody);
    if (unknown.length) return NextResponse.json({ error: `Unknown placeholder(s): ${unknown.map(item => `{${item}}`).join(', ')}` }, { status: 400 });

    const briefings = Array.isArray(body.briefings) ? body.briefings.slice(0, 500) : [];
    for (const item of briefings) {
      const zone = POLICE_BANDOBUSHT_ZONES.find(candidate => candidate.name === item?.zone);
      if (!zone || (item.sector && !zone.sectors.some(sector => sector.number === item.sector))) {
        return NextResponse.json({ error: 'Briefings must use zones and sectors from the scheme.' }, { status: 400 });
      }
      if ((item.briefing_date && !DATE.test(item.briefing_date)) || (item.briefing_time && !TIME.test(item.briefing_time))) {
        return NextResponse.json({ error: 'Use a valid briefing date and time.' }, { status: 400 });
      }
    }

    await saveMessageSettings({
      eventName: text(s.eventName, 200),
      eventDates: text(s.eventDates, 100),
      contact: text(s.contact, 60),
      signature: text(s.signature, 120),
      templateBody,
    });
    await saveBriefings(briefings.map((item: Record<string, string>) => ({
      zone: item.zone, sector: item.sector || null, briefing_date: item.briefing_date || null,
      briefing_time: item.briefing_time || null, venue: text(item.venue, 250) || null,
    })), auth.user.email);
    await services.auditRepository.createLog({
      action: 'SMS_SETTINGS_UPDATED',
      performed_by: auth.user.email,
      user_role: auth.user.role,
      details: `SMS message text and ${briefings.length} briefing(s) saved.`,
    });
    return NextResponse.json({ ok: true, dlt: toDltTemplate(templateBody) });
  } catch (error) {
    console.error('Message settings error:', error);
    return NextResponse.json({ error: 'Could not save the message settings.' }, { status: 500 });
  }
}
