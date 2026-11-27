import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { services } from '@/core/services/service-container';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const departments = await services.passRepository.getDepartmentCounts(auth.user);
    return NextResponse.json({ departments });
  } catch (error: unknown) {
    console.error('getDepartmentCounts error:', error);
    // Return empty array instead of 500 error to prevent frontend console crashes during transient database wake-up
    return NextResponse.json({ departments: [] }, { status: 200 });
  }
}
