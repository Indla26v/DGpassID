import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { autoAllotSubSectors, InchargeError, listIncharges, seniorCounts, setSlotOfficers } from '@/modules/deployment/incharges.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sub-sector allotments: SP all zones, zone / sector login its own zones (read only). */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Incharge allotment is managed by the District SP office.' }, { status: 403 });
  }
  const scope = deploymentScopeOf(auth.user);
  try {
    const [rows, seniors] = await Promise.all([
      listIncharges(scope === 'ALL' ? undefined : [...new Set(scope.map(area => area.zone))]),
      scope === 'ALL' ? seniorCounts() : Promise.resolve({}),
    ]);
    return NextResponse.json({ incharges: rows, seniorCounts: seniors }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('List incharges error:', error);
    return NextResponse.json({ error: 'Could not load the incharges.' }, { status: 500 });
  }
}

/**
 * SP only. { zone, sector, subSector?, passIds: [up to 3, in order] } saves the officers of a sub-sector, or of a sector
 * that has no sub-sectors (empty list clears it). Sectors with sub-sectors get their Sector Incharge automatically.
 * { action: 'auto', zone? } fills every empty place with the first officer of each of the top 3 ranks (SI and above).
 */
export async function PUT(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === 'auto') {
      const zoneName = body.zone ? String(body.zone) : undefined;
      if (zoneName && !POLICE_BANDOBUSHT_ZONES.some(item => item.name === zoneName)) {
        return NextResponse.json({ error: 'Choose a zone from the scheme.' }, { status: 400 });
      }
      return NextResponse.json(await autoAllotSubSectors(auth.user, zoneName));
    }
    const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === body?.zone);
    const sector = zone?.sectors.find(item => item.number === String(body?.sector ?? ''));
    const subSector = body?.subSector ? String(body.subSector) : null;
    if (!zone || !sector) return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
    const hasSubSectors = Boolean(sector.subSectors?.length);
    if (subSector ? !sector.subSectors?.includes(subSector) : hasSubSectors) {
      return NextResponse.json({
        error: hasSubSectors ? 'This sector has sub-sectors: allot each sub-sector. Its Sector Incharge is chosen automatically.' : 'Choose a sub-sector from the scheme.',
      }, { status: 400 });
    }
    const passIds: string[] = Array.isArray(body?.passIds) ? body.passIds.map(String) : [];
    if (passIds.some(id => !UUID.test(id))) return NextResponse.json({ error: 'Choose officers.' }, { status: 400 });
    return NextResponse.json(await setSlotOfficers(zone.name, sector.number, subSector, passIds, auth.user));
  } catch (error) {
    if (error instanceof InchargeError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Set incharge error:', error);
    return NextResponse.json({ error: 'Could not save the allotment.' }, { status: 500 });
  }
}
