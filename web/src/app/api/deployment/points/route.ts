import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { findDutyPoint, POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { assignDutyPoint, deploymentScopeOf } from '@/modules/deployment/deployment.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Places officers on a sector / sub-sector / duty point inside their allotted zone.
 * Zone officers may also move officers between sectors of their zone; sector officers stay in their sector.
 */
export async function PATCH(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const passIds: string[] = Array.isArray(body.passIds) ? [...new Set<string>(body.passIds)] : [];
    if (!passIds.length || passIds.length > 2000 || passIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
      return NextResponse.json({ error: 'Select between 1 and 2000 officers.' }, { status: 400 });
    }
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === body.zone);
    const sector = zone?.sectors.find(item => item.number === body.sectorNumber);
    if (!zone || !sector) return NextResponse.json({ error: 'Choose a sector from the scheme.' }, { status: 400 });

    const point = body.pointCode ? findDutyPoint(String(body.pointCode)) : undefined;
    if (body.pointCode && (!point || point.zone !== zone.name || point.sectorNumber !== sector.number)) {
      return NextResponse.json({ error: 'Choose a duty point inside this sector.' }, { status: 400 });
    }
    const subSector = point?.subSector ?? (body.subSector || null);
    if (subSector && !sector.subSectors?.includes(subSector)) {
      return NextResponse.json({ error: 'Choose a sub-sector inside this sector.' }, { status: 400 });
    }

    const scope = deploymentScopeOf(auth.user);
    const zoneWide = scope === 'ALL' || scope.some(item => item.zone === zone.name && item.sector === null);
    if (!zoneWide && !scope.some(item => item.zone === zone.name && item.sector === sector.number)) {
      return NextResponse.json({ error: 'This sector is not assigned to you.' }, { status: 403 });
    }

    const result = await assignDutyPoint({
      passIds,
      zone: zone.name,
      sectorNumber: sector.number,
      sectorName: subSector || sector.name,
      pointCode: point?.code ?? null,
      pointName: point?.name ?? null,
      canChangeSector: zoneWide,
    }, auth.user);
    if (!result.updated) {
      return NextResponse.json({ error: 'None of the selected officers are allotted to your zone or sector.' }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Duty point assignment error:', error);
    return NextResponse.json({ error: 'Could not save the duty posting.' }, { status: 500 });
  }
}
