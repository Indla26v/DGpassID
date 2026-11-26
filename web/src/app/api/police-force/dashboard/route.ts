import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { isForceCategory } from '@/core/domain/ranks';
import { loadPoliceDashboard } from '@/modules/deployment/dashboard';

/** SP only: Police Force dashboard figures, optionally for one force category and/or one zone. */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  if (!managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'The Police Force dashboard is restricted to the District SP office.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') || '';
  const zone = searchParams.get('zone') || '';
  if (force && !isForceCategory(force)) return NextResponse.json({ error: 'Choose a force category.' }, { status: 400 });
  if (zone && !POLICE_BANDOBUSHT_ZONES.some(item => item.name === zone)) return NextResponse.json({ error: 'Choose a zone from the scheme.' }, { status: 400 });

  try {
    const dashboard = await loadPoliceDashboard({ force: force || undefined, zone: zone || undefined });
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Police dashboard error:', error);
    return NextResponse.json({ error: 'Could not load the dashboard.' }, { status: 500 });
  }
}
