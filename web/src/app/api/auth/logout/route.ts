import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { getSessionTokenFromRequest, clearSessionCookie } from '@/lib/auth/session-helper';
import { tokenHash } from '@/lib/auth/password';

export async function POST(req: Request) {
  try {
    const token = getSessionTokenFromRequest(req);
    if (token) {
      const hash = tokenHash(token);
      await services.userRepository.deleteSession(hash);
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  return NextResponse.json(
    { success: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookie(),
      },
    }
  );
}
