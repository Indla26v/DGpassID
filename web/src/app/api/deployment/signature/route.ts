import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { services } from '@/core/services/service-container';

/** Read only: the SP's saved name and signature, printed on every duty passport (for the editor preview). */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty passports are managed by the District SP office.' }, { status: 403 });
  }
  try {
    const authority = await services.configRepository.getAuthoritySignature('district');
    return NextResponse.json(
      { name: authority.name, signatureUrl: authority.signatureUrl?.startsWith('data:image/') ? authority.signatureUrl : null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Passport signature error:', error);
    return NextResponse.json({ error: 'Could not load the SP signature.' }, { status: 500 });
  }
}
