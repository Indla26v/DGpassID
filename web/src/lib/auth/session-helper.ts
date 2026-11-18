import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { SessionUser, UserRole } from '@/core/domain/entities/user.entity';
import { managesAccounts } from '@/core/domain/offices';
import { tokenHash } from './password';

export const SESSION_COOKIE_NAME = 'dgp_session';

export function getSessionTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      const val = cookie.substring(SESSION_COOKIE_NAME.length + 1).trim();
      return val || null;
    }
  }
  return null;
}

export async function getAuthenticatedUser(req: Request): Promise<SessionUser | null> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;

  const hash = tokenHash(token);
  return services.userRepository.findSessionUser(hash);
}

export function checkCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    return true; // Non-browser / same-origin requests without origin header
  }

  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
  const hostOrigin = host ? `${proto}://${host}` : null;
  const requestOrigin = new URL(req.url).origin;
  const expectedOrigin = process.env.APP_ORIGIN?.trim();

  const normalize = (url: string) => url.toLowerCase().replace('127.0.0.1', 'localhost').replace(/\/$/, '');

  const normOrigin = normalize(origin);
  if (expectedOrigin && normalize(expectedOrigin) === normOrigin) return true;
  if (normalize(requestOrigin) === normOrigin) return true;
  if (hostOrigin && normalize(hostOrigin) === normOrigin) return true;

  return false;
}

export async function authorizeRequest(
  req: Request,
  allowedRoles?: UserRole[],
  districtOnly = false
): Promise<{ user: SessionUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  if (!checkCsrf(req)) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Request origin is not allowed.' },
        { status: 403 }
      ),
    };
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      ),
    };
  }

  if ((allowedRoles && !allowedRoles.includes(user.role)) || (districtOnly && !managesAccounts(user))) {
    return {
      errorResponse: NextResponse.json(
        { error: 'You do not have permission to perform this action.' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export function createSessionCookie(token: string, isHttps: boolean = false): string {
  const maxAge = 8 * 60 * 60; // 8 hours
  const secureFlag = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureFlag}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}
