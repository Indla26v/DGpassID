import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { resolveDutyPosting } from '@/core/domain/police-zones';
import { query } from '@/infrastructure/db/pool';
import { listInstructions } from '@/modules/deployment/instructions.repository';
import { deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { intersectScopes } from '@/core/domain/duty-passport';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Active duty instructions whose passport an officer gets (?id=<pass id>): the instruction covers the officer's
 * zone / sector / sub-sector and the caller may print it. Used by the Print Passport buttons.
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty passports are managed by the District SP office.' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Officer not found.' }, { status: 404 });
  try {
    const res = await query<{ police_zone: string | null; police_sector_number: string | null; police_sector_name: string | null }>(
      "SELECT police_zone, police_sector_number, police_sector_name FROM passes WHERE id = $1 AND pass_type = 'POLICE_FORCE'",
      [id],
    );
    const officer = res.rows[0];
    if (!officer) return NextResponse.json({ error: 'Officer not found.' }, { status: 404 });
    if (!officer.police_zone || !officer.police_sector_number) {
      return NextResponse.json({ instructions: [], reason: 'Allot this officer to a zone and sector first.' });
    }
    const posting = resolveDutyPosting(officer.police_zone, officer.police_sector_number, officer.police_sector_name);
    const scope = deploymentScopeOf(auth.user);
    const covers = (targets: { zone: string; sector: string | null; subSector?: string | null }[]) =>
      intersectScopes(targets, scope).some(target => target.zone === officer.police_zone &&
        (target.sector === null || (target.sector === officer.police_sector_number &&
          (!target.subSector || target.subSector === posting.subSector))));
    const instructions = (await listInstructions(auth.user))
      .filter(item => item.status === 'ACTIVE' && covers(item.targets))
      .map(item => ({ id: item.id, title: item.title, version: item.version }));
    return NextResponse.json({
      instructions,
      reason: instructions.length ? null : 'No duty instruction covers this officer\'s sector yet. Create one under Instructions.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Officer instructions error:', error);
    return NextResponse.json({ error: 'Could not look up the duty instructions.' }, { status: 500 });
  }
}
