import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { hashPassword } from '@/lib/auth/password';
import { isOfficeId } from '@/core/domain/offices';
import { UserRole } from '@/core/domain/entities/user.entity';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  const users = await services.userRepository.list();
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const email = (body.email || '').toString().trim().toLowerCase();
    const name = (body.name || '').toString().trim();
    const password = (body.password || '').toString();
    const role = (body.role || '').toString().toUpperCase() as UserRole;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (!name || name.length > 100) {
      return NextResponse.json({ error: 'Enter a name of 1–100 characters.' }, { status: 400 });
    }

    if (!password || password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: 'Use a password of 12–128 characters.' }, { status: 400 });
    }

    if (!['ADMIN', 'PRINT_TEAM'].includes(role)) {
      return NextResponse.json({ error: 'Role must be ADMIN or PRINT_TEAM.' }, { status: 400 });
    }

    const officeId = body.officeId || null;
    if (officeId !== null && (role !== 'ADMIN' || !isOfficeId(officeId))) {
      return NextResponse.json({ error: 'Choose a valid office for an administrator.' }, { status: 400 });
    }
    if (auth.user.officeId === 'district' && role === 'ADMIN' && !officeId) {
      return NextResponse.json({ error: 'Only a system administrator can create another system administrator.' }, { status: 403 });
    }

    const existing = await services.userRepository.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const created = await services.userRepository.create(email, name, role, passwordHash, officeId);

    await services.auditRepository.createLog({
      action: 'USER_CREATED',
      performed_by: auth.user.email,
      user_role: 'ADMIN',
      details: `Created user ${email} with role ${role}.`,
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const { id, is_active } = body;

    if (!id || typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'Account ID and valid is_active status are required.' }, { status: 400 });
    }

    if (id === auth.user.id) return NextResponse.json({ error: 'You cannot change your own account status.' }, { status: 400 });
    const updated = await services.userRepository.setActive(id, is_active, auth.user.officeId === 'district');
    if (!updated) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    await services.auditRepository.createLog({
      action: is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      performed_by: auth.user.email,
      user_role: 'ADMIN',
      details: `User ${id} active status changed to ${is_active}.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update user status error:', error);
    return NextResponse.json({ error: 'Failed to update user status.' }, { status: 500 });
  }
}
