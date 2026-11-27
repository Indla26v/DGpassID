import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { rankGroupOf } from '@/core/domain/ranks';
import { schemeColumnOf, schemeRequirement } from '@/core/domain/scheme-requirements';
import { deploymentScopeOf, sectorRankCounts } from '@/modules/deployment/deployment.repository';
import { scopeTouches } from '@/core/domain/police-print-scope';

/**
 * Scheme requirement vs officers already allotted, by rank, for one sector (and its sub-sectors).
 * Response: { required, allotted, other, total, subSectors: [{ name, required, allotted }] }
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === searchParams.get('zone'));
  const sector = zone?.sectors.find(item => item.number === searchParams.get('sector'));
  if (!zone || !sector) return NextResponse.json({ error: 'Choose a zone and sector from the scheme.' }, { status: 400 });
  const scope = deploymentScopeOf(auth.user);
  if (scope !== 'ALL' && !scopeTouches(scope, zone.name, sector.number)) {
    return NextResponse.json({ error: 'This sector is not assigned to you.' }, { status: 403 });
  }

  try {
    const rows = await sectorRankCounts(zone.name, sector.number);
    const tally = (filter: (sectorName: string | null) => boolean) => {
      const allotted: Record<string, number> = {};
      const other: Record<string, number> = {};
      for (const row of rows.filter(item => filter(item.sector_name))) {
        const column = schemeColumnOf(row.rank);
        const bucket = column ? allotted : other;
        const key = column ?? (rankGroupOf(row.rank) || 'Unknown');
        bucket[key] = (bucket[key] ?? 0) + row.count;
      }
      return { allotted, other };
    };
    const whole = tally(() => true);
    return NextResponse.json({
      required: schemeRequirement(zone.name, sector.number) ?? null,
      ...whole,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      subSectors: (sector.subSectors ?? []).map(name => ({
        name,
        required: schemeRequirement(zone.name, sector.number, name) ?? null,
        allotted: tally(sectorName => sectorName === name).allotted,
      })),
    });
  } catch (error) {
    console.error('Sector summary error:', error);
    return NextResponse.json({ error: 'Could not load the sector summary.' }, { status: 500 });
  }
}
