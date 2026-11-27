import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { verifyPassword, generateToken, tokenHash } from '@/lib/auth/password';
import { checkCsrf, createSessionCookie } from '@/lib/auth/session-helper';

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 400 });
    }
    const identifier = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password || identifier.length > 254 || password.length > 128) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }
    let accountKey = identifier.includes('@') ? identifier : null;
    if (identifier === 'admin' || identifier === 'print') {
      accountKey = `${identifier}@dgp.local`;
    } else if (/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(identifier)) {
      accountKey = await services.userRepository.resolveUsername(identifier);
    }

    const attemptKey = accountKey ?? identifier;
    const currentAttempts = await services.userRepository.checkLoginAttempts(attemptKey);
    if (currentAttempts > 10) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again after 15 minutes.' },
        {
          status: 429,
          headers: { 'Retry-After': '900' },
        }
      );
    }

    const user = accountKey ? await services.userRepository.findByEmail(accountKey) : null;
    const isValid = user && user.password_hash && verifyPassword(password, user.password_hash);

    if (!user || !isValid || !user.is_active) {
      await services.userRepository.recordLoginAttempt(attemptKey);
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }

    await services.userRepository.resetLoginAttempts(attemptKey);
    await services.userRepository.deleteExpiredSessions();

    const token = generateToken();
    const hash = tokenHash(token);
    await services.userRepository.createSession(hash, user.id);

    await services.auditRepository.createLog({
      action: 'USER_SIGNED_IN',
      performed_by: user.email,
      user_role: user.role,
      details: 'Account signed in.',
    });

    const isHttps = req.url.startsWith('https://');
    const cookieValue = createSessionCookie(token, isHttps);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      officeId: user.officeId,
      policePrintScope: user.policePrintScope,
      is_active: user.is_active,
    };

    return NextResponse.json(
      { user: safeUser },
      {
        headers: {
          'Set-Cookie': cookieValue,
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'An error occurred during sign in.' }, { status: 500 });
  }
}
