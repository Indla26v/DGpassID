import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { services } from '@/core/services/service-container';
import { getMessageSettings, prepareRecipients } from '@/modules/messaging/messaging.repository';
import { buildVariables, normalizeIndianMobile, render, SAMPLE_VALUES, toDltTemplate } from '@/modules/messaging/template';
import { sendDltSms, smsConfig } from '@/modules/messaging/sms.client';

/** SP only: sends the SMS once to a number the SP types, filled with a sample officer's details. */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const body = await req.json();
    const to = normalizeIndianMobile(typeof body.mobile === 'string' ? body.mobile : '');
    if (!to) return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });

    const settings = await getMessageSettings();
    const { recipients } = await prepareRecipients({ districts: [], ranks: [], onlyOnPoint: false }, 1);
    const values = recipients[0]?.values ?? { ...SAMPLE_VALUES, event: settings.eventName, event_dates: settings.eventDates, contact: settings.contact, signature: settings.signature };
    const { order } = toDltTemplate(settings.templateBody);
    const config = smsConfig();
    const result = await sendDltSms(to, buildVariables(order, values), config);

    await services.auditRepository.createLog({
      action: 'SMS_TEST_SENT',
      performed_by: auth.user.email,
      user_role: auth.user.role,
      details: `SMS test to ${to.slice(0, 4)}******${to.slice(-2)}: ${result.ok ? (result.simulated ? 'simulated (dry run)' : 'accepted') : `failed (${result.error})`}.`,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, simulated: result.simulated, message: render(settings.templateBody, values) });
  } catch (error) {
    console.error('SMS test error:', error);
    return NextResponse.json({ error: 'Could not send the test message.' }, { status: 500 });
  }
}
