import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { listPoliceStations } from '@/modules/deployment/police-stations.repository';

/**
 * Police stations master data (read only): feeds the police station pick lists and filters.
 * The list lives in the database (db/police-stations.sql); ?district= narrows it.
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;
  const district = new URL(req.url).searchParams.get('district')?.trim() || undefined;
  try {
    return NextResponse.json({ stations: await listPoliceStations(district) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('List police stations error:', error);
    return NextResponse.json({ error: 'Could not load the police stations.' }, { status: 500 });
  }
}
