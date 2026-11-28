import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { findDutyPoint, POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { assignDutyPoint, deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { scopeCovers } from '@/core/domain/police-print-scope';
import { addCustomDutyPoint, CustomPointError, deleteCustomDutyPoint, loadCustomDutyPoints } from '@/modules/deployment/custom-points.repository';

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

    if (body.pointCode) await loadCustomDutyPoints();
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
    if (!zoneWide && !scopeCovers(scope, zone.name, sector.number, subSector)) {
      return NextResponse.json({ error: subSector ? 'This sub-sector is not assigned to you.' : 'This sector is not assigned to you.' }, { status: 403 });
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

/** The SP, or a zone / sector login allowed to post in that zone, sector and sub-sector. */
async function authorizePlace(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return { error: auth.errorResponse };
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return { error: NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 }) };
  }
  return { user: auth.user };
}

/** Duty points added in the app (the scheme's own points are built into the app). */
export async function GET(req: Request) {
  const auth = await authorizePlace(req);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ points: await loadCustomDutyPoints() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('List duty points error:', error);
    return NextResponse.json({ error: 'Could not load the duty points.' }, { status: 500 });
  }
}

/** { zone, sectorNumber, subSector?, name } adds a duty point. A sector with sub-sectors needs the sub-sector. */
export async function POST(req: Request) {
  const auth = await authorizePlace(req);
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === body?.zone);
  const sector = zone?.sectors.find(item => item.number === body?.sectorNumber);
  if (!zone || !sector) return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
  const subSector = body?.subSector ? String(body.subSector) : null;
  if (sector.subSectors?.length ? !subSector || !sector.subSectors.includes(subSector) : subSector) {
    return NextResponse.json({ error: sector.subSectors?.length ? 'Choose the sub-sector for this point.' : 'This sector has no sub-sectors.' }, { status: 400 });
  }
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
  if (name.length < 2) return NextResponse.json({ error: 'Enter the duty point name.' }, { status: 400 });
  const scope = deploymentScopeOf(auth.user!);
  const zoneWide = scope === 'ALL' || scope.some(item => item.zone === zone.name && item.sector === null);
  if (!zoneWide && !scopeCovers(scope, zone.name, sector.number, subSector)) {
    return NextResponse.json({ error: 'This sector or sub-sector is not assigned to you.' }, { status: 403 });
  }
  try {
    return NextResponse.json({ point: await addCustomDutyPoint(zone.name, sector.number, subSector, name, auth.user!) }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomPointError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Add duty point error:', error);
    return NextResponse.json({ error: 'Could not add the duty point.' }, { status: 500 });
  }
}

/** ?code= removes an added duty point (SP only) when nobody is posted on it. */
export async function DELETE(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const code = new URL(req.url).searchParams.get('code') ?? '';
  if (!/^N-[A-Z0-9-]{3,28}$/.test(code)) return NextResponse.json({ error: 'Only points added in the app can be removed.' }, { status: 400 });
  try {
    await deleteCustomDutyPoint(code, auth.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CustomPointError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Remove duty point error:', error);
    return NextResponse.json({ error: 'Could not remove the duty point.' }, { status: 500 });
  }
}
