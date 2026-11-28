/**
 * Messaging service — Fast2SMS DLT client (server only).
 * Dry run (SMS_DRY_RUN unset or not "0") never calls Fast2SMS: it returns a fake request id.
 *
 * Fast2SMS DLT route: POST https://www.fast2sms.com/dev/bulkV2 with header `authorization: <API key>` and
 * { route: 'dlt', sender_id, message: <DLT message id from Fast2SMS DLT Manager>, variables_values: 'a|b|c', numbers, flash: 0 }.
 * Check the request against Fast2SMS's current API documentation when going live.
 */
import crypto from 'crypto';

export interface SmsConfig {
  dryRun: boolean;
  configured: boolean;
  provider: 'Fast2SMS';
  senderId: string;
  messageId: string;
}

export function smsConfig(): SmsConfig {
  const senderId = process.env.SMS_SENDER_ID?.trim() ?? '';
  const messageId = process.env.SMS_DLT_MESSAGE_ID?.trim() ?? '';
  return {
    dryRun: process.env.SMS_DRY_RUN?.trim() !== '0',
    configured: Boolean(process.env.FAST2SMS_API_KEY?.trim() && senderId && messageId),
    provider: 'Fast2SMS',
    senderId,
    messageId,
  };
}

export type SendResult = { ok: true; requestId: string; simulated: boolean } | { ok: false; error: string };

/** Sends one DLT SMS. `mobile` is 91XXXXXXXXXX; `variables` is "a|b|c" in template order. */
export async function sendDltSms(mobile: string, variables: string, config = smsConfig()): Promise<SendResult> {
  if (config.dryRun) return { ok: true, requestId: `dryrun.${crypto.randomUUID()}`, simulated: true };
  if (!config.configured) return { ok: false, error: 'SMS is not configured (Fast2SMS API key, sender ID, DLT message ID).' };

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: process.env.FAST2SMS_API_KEY!.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        route: 'dlt',
        sender_id: config.senderId,
        message: config.messageId,
        variables_values: variables,
        numbers: mobile.replace(/^91/, ''),
        flash: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.return === true && data?.request_id) return { ok: true, requestId: String(data.request_id), simulated: false };
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    return { ok: false, error: `${data?.status_code ?? response.status}: ${message || 'Request failed'}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
