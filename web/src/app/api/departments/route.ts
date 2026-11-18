import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const external = await services.departmentRepository.listExternalDepartments();
  const internal = await services.departmentRepository.listInternalStaffRoles();

  return NextResponse.json({
    externalDepartments: external.map((d) => d.name),
    internalStaffRoles: internal.map((r) => r.name),
  });
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const name = (body.name || '').toString().trim();
    const type = (body.type || 'EXTERNAL').toString().toUpperCase();

    if (!name || name.length > 255) {
      return NextResponse.json({ error: 'Enter a department or role name (up to 255 characters).' }, { status: 400 });
    }

    let created;
    if (type === 'EXTERNAL') {
      created = await services.departmentRepository.addExternalDepartment(name, auth.user.email);
    } else {
      created = await services.departmentRepository.addInternalStaffRole(name, 'INTERNAL', auth.user.email);
    }

    await services.auditRepository.createLog({
      action: 'DEPARTMENT_ADDED',
      performed_by: auth.user.email,
      user_role: 'ADMIN',
      details: `Added ${type === 'EXTERNAL' ? 'department' : 'staff role'}: ${name}.`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Add department error:', error);
    return NextResponse.json({ error: 'Failed to add department or role.' }, { status: 500 });
  }
}
