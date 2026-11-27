import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { passportIncharges } from '@/core/domain/duty-passport';
import { scopeTouches } from '@/core/domain/police-print-scope';
import { deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { currentIncharges } from '@/modules/deployment/incharges.repository';
import { listSectorSeniors, listZoneAccounts } from '@/modules/deployment/passports.repository';

/**
 * Passport footer names for one sector or sub-sector (?zone=&sector=&subSector=), as they will print:
 * Sector Incharge, Sub-sector Incharge and the next officers with phones. SP, or a login covering that area.
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty passports are managed by the District SP office.' }, { status: 403 });
  }
  const params = new URL(req.url).searchParams;
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === params.get('zone'));
  const sector = zone?.sectors.find(item => item.number === params.get('sector'));
  const subSector = params.get('subSector') || null;
  if (!zone || !sector || (subSector && !sector.subSectors?.includes(subSector))) {
    return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
  }
  const scope = deploymentScopeOf(auth.user);
  if (scope !== 'ALL' && !scopeTouches(scope, zone.name, sector.number)) {
    return NextResponse.json({ error: 'This area is outside your login.' }, { status: 403 });
  }
  try {
    const [accounts, allotments, seniors] = await Promise.all([
      listZoneAccounts(), currentIncharges([zone.name]), listSectorSeniors([zone.name]),
    ]);
    const footer = passportIncharges(
      { police_zone: zone.name, police_sector_number: sector.number, police_sector_name: subSector },
      accounts, allotments, seniors,
    );
    return NextResponse.json(footer, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Passport footer preview error:', error);
    return NextResponse.json({ error: 'Could not load the incharges.' }, { status: 500 });
  }
}
