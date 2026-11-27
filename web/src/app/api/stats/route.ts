import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const includeRegistryTotal = new URL(req.url).searchParams.get('include_registry_total') === '1';
  const stats = await services.passRepository.getStatistics(auth.user, includeRegistryTotal);
  return NextResponse.json(stats);
}
