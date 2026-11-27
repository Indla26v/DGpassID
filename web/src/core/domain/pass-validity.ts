import type { PassEntity } from './entities/pass.entity';

export const PASS_VALID_TO = '2026-12-02';
export const PASS_VALID_TO_LABEL = '30 Nov 2026';

const conferenceDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function toConferenceDate(date: string | Date): string {
  return conferenceDate.format(new Date(date));
}

export function getPassValidFrom(pass: Partial<PassEntity>): string {
  if (pass.last_printed_at && Number.isFinite(new Date(pass.last_printed_at).getTime())) {
    return toConferenceDate(pass.last_printed_at);
  }
  return (pass.printed_count ?? 0) > 0 ? pass.valid_from || '' : '';
}
