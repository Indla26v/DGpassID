import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { RANK_GROUPS } from '@/core/domain/ranks';
import { allotOfficers } from '@/modules/deployment/deployment.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SP only: allots the selected officers to a zone and sector. */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const passIds: string[] = Array.isArray(body.passIds) ? [...new Set<string>(body.passIds)] : [];
    if (!passIds.length || passIds.length > 5000 || passIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
      return NextResponse.json({ error: 'Select between 1 and 5000 officers.' }, { status: 400 });
    }
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === body.zone);
    const sector = zone?.sectors.find(item => item.number === body.sectorNumber);
    if (!zone || !sector) return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
    const subSector = typeof body.subSector === 'string' && body.subSector.trim() ? body.subSector.trim() : null;
    if (subSector && !sector.subSectors?.includes(subSector)) {
      return NextResponse.json({ error: 'Choose a sub-sector inside this sector.' }, { status: 400 });
    }
    const rankGroup = RANK_GROUPS.find(item => item.group === body.rankGroup)?.group ?? 'MIXED';

    const result = await allotOfficers({
      passIds,
      zone: zone.name,
      sectorNumber: sector.number,
      sectorName: subSector ?? sector.name,
      rankGroup,
      districts: Array.isArray(body.districts) ? body.districts.filter((item: unknown) => typeof item === 'string').slice(0, 100) : [],
      requestedCount: Number.isInteger(body.requestedCount) && body.requestedCount > 0 ? body.requestedCount : passIds.length,
      composition: body.composition && typeof body.composition === 'object' ? body.composition : {},
    }, auth.user);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Officer allotment error:', error);
    return NextResponse.json({ error: 'Could not allot the officers.' }, { status: 500 });
  }
}
