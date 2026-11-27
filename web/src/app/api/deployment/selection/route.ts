import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { isForceCategory, RANK_GROUPS } from '@/core/domain/ranks';
import { officerAge } from '@/lib/officer-age';
import { getAgeCutoffYears, listSelectionPool } from '@/modules/deployment/deployment.repository';
import { selectOfficers } from '@/modules/deployment/selection';

/** SP only: randomly selects officers of one rank group from the chosen districts (preview, nothing is saved). */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const allRanks = !body.rankGroup || body.rankGroup === 'ALL';
    const group = allRanks
      ? { group: 'All ranks', ranks: RANK_GROUPS.flatMap(item => [...item.ranks]) }
      : RANK_GROUPS.find(item => item.group === body.rankGroup);
    if (!group) return NextResponse.json({ error: 'Choose a rank.' }, { status: 400 });
    // poolOnly: just list the matching officers (live display), no random pick.
    const poolOnly = body.poolOnly === true;
    const count = poolOnly ? 0 : Number(body.count);
    if (!poolOnly && (!Number.isInteger(count) || count < 1 || count > 5000)) {
      return NextResponse.json({ error: 'Enter how many officers to select (1–5000).' }, { status: 400 });
    }
    const districts: string[] = Array.isArray(body.districts)
      ? [...new Set(body.districts.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim()))] as string[]
      : [];
    if (districts.length > 100) return NextResponse.json({ error: 'Choose at most 100 districts.' }, { status: 400 });

    const cutoff = await getAgeCutoffYears();
    if (body.force && !isForceCategory(body.force)) return NextResponse.json({ error: 'Choose a force category.' }, { status: 400 });
    const pool = await listSelectionPool([...group.ranks], districts, Boolean(body.includeAllotted), body.force || undefined);
    const ages = new Map(pool.map(officer => [officer.id, officerAge(officer)]));
    if (poolOnly) {
      return NextResponse.json({
        ageCutoffYears: cutoff,
        poolSize: pool.length,
        pool: pool.map(officer => ({ ...officer, age: ages.get(officer.id) ?? null })),
      });
    }
    const result = selectOfficers(
      pool.map(officer => ({ id: officer.id, rank: (officer.rank ?? '').toUpperCase(), age: ages.get(officer.id) ?? null })),
      group.group,
      count,
      cutoff,
      max => crypto.randomInt(max),
    );
    return NextResponse.json({
      ...result,
      ageCutoffYears: cutoff,
      pool: pool.map(officer => ({ ...officer, age: ages.get(officer.id) ?? null })),
    });
  } catch (error) {
    console.error('Officer selection error:', error);
    return NextResponse.json({ error: 'Could not select officers.' }, { status: 500 });
  }
}
