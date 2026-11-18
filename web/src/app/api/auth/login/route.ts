import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { verifyPassword, generateToken, tokenHash } from '@/lib/auth/password';
import { checkCsrf, createSessionCookie } from '@/lib/auth/session-helper';

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    let email = (body.email || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();

    if (email === 'admin') email = 'admin@dgp.local';
    if (email === 'print') email = 'print@dgp.local';

    if (!email || !password || email.length > 254 || password.length > 128) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }

    const currentAttempts = await services.userRepository.checkLoginAttempts(email);
    if (currentAttempts > 10) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again after 15 minutes.' },
        {
          status: 429,
          headers: { 'Retry-After': '900' },
        }
      );
    }

    const user = await services.userRepository.findByEmail(email);
    const isValid = user && user.password_hash && verifyPassword(password, user.password_hash);

    if (!user || !isValid || !user.is_active) {
      await services.userRepository.recordLoginAttempt(email);
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }

    await services.userRepository.resetLoginAttempts(email);
    await services.userRepository.deleteExpiredSessions();

    const token = generateToken();
    const hash = tokenHash(token);
    await services.userRepository.createSession(hash, user.id, 8);

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
