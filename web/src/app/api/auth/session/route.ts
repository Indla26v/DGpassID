import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      officeId: auth.user.officeId,
      is_active: true,
    },
  });
}
