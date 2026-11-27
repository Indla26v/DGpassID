import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { services } from '@/core/services/service-container';
import { tokenFromQrPayload } from '@/core/domain/duty-passport';
import { findScannedOfficer, type ScannedOfficer } from '@/modules/deployment/passports.repository';

const NOT_PRINTED = 'Confirm a successful print before issuing the badge.';

const officerView = (officer: ScannedOfficer) => ({
  id: officer.id,
  passNumber: officer.pass_number,
  name: officer.full_name,
  rank: officer.rank,
  gNo: officer.police_id_number,
  zone: officer.police_zone,
  sector: officer.police_sector_number,
  sectorName: officer.police_sector_name,
  photoUrl: officer.photo_url,
  issuedAt: officer.collected_at,
  issuedBy: officer.handover_officer_name,
});

/**
 * Scan & Issue: a duty ID card / duty passport QR (or the code a handheld scanner types) marks that
 * officer's ID card as issued. SP: any officer. Zone / sector logins and police print operators: their area only.
 */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Scan & Issue for police badges is run by the District SP office.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const token = tokenFromQrPayload(String(body?.payload ?? ''));
  if (!/^[A-Z0-9-]{6,128}$/.test(token)) {
    return NextResponse.json({ outcome: 'NOT_FOUND', message: 'This is not a duty ID card code.' }, { status: 404 });
  }

  try {
    const officer = await findScannedOfficer(token, auth.user);
    if (!officer) {
      return NextResponse.json({ outcome: 'NOT_FOUND', message: 'No officer in your area has this ID card.' }, { status: 404 });
    }
    if (officer.status === 'ISSUED') {
      return NextResponse.json({ outcome: 'ALREADY_ISSUED', message: 'This ID card was already issued.', officer: officerView(officer) });
    }
    if (officer.status !== 'PRINTED' || officer.printed_count < 1) {
      return NextResponse.json({ outcome: 'NOT_PRINTED', message: 'This ID card has not been printed yet.', officer: officerView(officer) }, { status: 409 });
    }
    const issued = await services.passRepository.issuePolicePass(officer.id, auth.user);
    return NextResponse.json({
      outcome: 'ISSUED',
      message: 'ID card issued.',
      officer: officerView({ ...officer, status: issued.status, collected_at: issued.collected_at as string | null, handover_officer_name: issued.handover_officer_name as string | null }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === NOT_PRINTED) return NextResponse.json({ outcome: 'NOT_PRINTED', message: 'This ID card has not been printed yet.' }, { status: 409 });
    if (message === 'Police pass not found.') return NextResponse.json({ outcome: 'NOT_FOUND', message: 'No officer in your area has this ID card.' }, { status: 404 });
    console.error('Scan & Issue error:', error);
    return NextResponse.json({ error: 'Could not issue the ID card. Try again.' }, { status: 500 });
  }
}
