import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const stats = await services.passRepository.getPoliceForceStatistics(auth.user);
    return NextResponse.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch police force statistics.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
