import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { deploymentScopeOf, listAllottedOfficers } from '@/modules/deployment/deployment.repository';

/** Officers allotted to a zone (optionally one sector) that the SP or zone/sector officer manages. */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === searchParams.get('zone'));
  const sectorNumber = searchParams.get('sector') || undefined;
  if (!zone || (sectorNumber && !zone.sectors.some(item => item.number === sectorNumber))) {
    return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
  }
  const scope = deploymentScopeOf(auth.user);
  if (scope !== 'ALL' && !scope.some(item => item.zone === zone.name && (item.sector === null || !sectorNumber || item.sector === sectorNumber))) {
    return NextResponse.json({ error: 'This zone or sector is not assigned to you.' }, { status: 403 });
  }

  try {
    const officers = await listAllottedOfficers(auth.user, zone.name, sectorNumber);
    return NextResponse.json({ officers });
  } catch (error) {
    console.error('Allotted officers error:', error);
    return NextResponse.json({ error: 'Could not load the officers.' }, { status: 500 });
  }
}
