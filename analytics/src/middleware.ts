import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
export function middleware(request: NextRequest) {
  const nonce = randomBytes(24).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  const csp = ["default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:", `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'",
    ...(development ? [] : ['upgrade-insecure-requests'])].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'private, no-store');
  if (!development) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'], runtime: 'nodejs' };
