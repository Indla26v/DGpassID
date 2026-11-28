import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { changeLocalOfficer, listLocalOfficers, LocalOfficerError, searchDirectory } from '@/modules/deployment/local-officers.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Local Officers: SP all zones, zone / sector login its own zones (read only).
 * ?q= (SP only) searches the whole personnel directory for an officer to attach.
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Local Officers are managed by the District SP office.' }, { status: 403 });
  }
  const scope = deploymentScopeOf(auth.user);
  const term = (new URL(req.url).searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  try {
    if (term) {
      if (scope !== 'ALL') return NextResponse.json({ error: 'Only the SP can attach Local Officers.' }, { status: 403 });
      if (term.length < 2) return NextResponse.json({ officers: [] });
      return NextResponse.json({ officers: await searchDirectory(term) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const rows = await listLocalOfficers(scope === 'ALL' ? undefined : [...new Set(scope.map(area => area.zone))]);
    return NextResponse.json({ localOfficers: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Local officers error:', error);
    return NextResponse.json({ error: 'Could not load the Local Officers.' }, { status: 500 });
  }
}

/** SP only. { zone, sector, subSector?, passId, action: 'add' | 'remove' } attaches or detaches one Local Officer. */
export async function PUT(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  const body = await req.json().catch(() => null);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === body?.zone);
  const sector = zone?.sectors.find(item => item.number === String(body?.sector ?? ''));
  const subSector = body?.subSector ? String(body.subSector) : null;
  if (!zone || !sector || (subSector && !sector.subSectors?.includes(subSector))) {
    return NextResponse.json({ error: 'Choose a zone, sector or sub-sector from the scheme.' }, { status: 400 });
  }
  const passId = String(body?.passId ?? '');
  const action = body?.action === 'remove' ? 'remove' : body?.action === 'add' ? 'add' : null;
  if (!UUID.test(passId) || !action) return NextResponse.json({ error: 'Choose an officer to add or remove.' }, { status: 400 });
  try {
    return NextResponse.json(await changeLocalOfficer(action, zone.name, sector.number, subSector, passId, auth.user));
  } catch (error) {
    if (error instanceof LocalOfficerError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Save local officer error:', error);
    return NextResponse.json({ error: 'Could not save the Local Officer.' }, { status: 500 });
  }
}
