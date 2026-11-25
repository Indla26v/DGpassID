import { NextResponse } from 'next/server';
import { authorizeRequest, checkCsrf, createSessionCookie, getSessionTokenFromRequest } from '@/lib/auth/session-helper';
import { tokenHash } from '@/lib/auth/password';
import { services } from '@/core/services/service-container';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      officeId: auth.user.officeId,
      policePrintScope: auth.user.policePrintScope,
      is_active: true,
    },
  });
}

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  const token = getSessionTokenFromRequest(req);
  const user = token ? await services.userRepository.renewSession(tokenHash(token)) : null;
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  return NextResponse.json({ user: { ...user, is_active: true } }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Set-Cookie': createSessionCookie(token, req.url.startsWith('https://')),
    },
  });
}
