import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { validateMobile, validateGovernmentId } from '@/lib/identity-validation';

const EDITABLE_FIELDS = [
  'full_name',
  'father_or_spouse_name',
  'personnel_type',
  'institution',
  'institution_other',
  'category',
  'category_other',
  'department',
  'designation_or_trade',
  'dept_hostel_quarter',
  'mobile_number',
  'govt_id_type',
  'govt_id_number',
  'zone_a',
  'gate_zone_a',
  'zone_b',
  'gate_zone_b',
  'zone_c',
  'gate_zone_c',
  'valid_from',
  'valid_to',
  'photo_url',
  'cardholder_signature_url',
];

const ADMIN_EXTRA_FIELDS = [
  'status',
  'office_id',
  'has_hologram',
  'has_official_seal',
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const pass = await services.passRepository.findById(id, auth.user);
  if (!pass) {
    return NextResponse.json({ error: 'Pass not found.' }, { status: 404 });
  }

  return NextResponse.json(pass);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const existing = await services.passRepository.findById(id, auth.user);
  if (!existing) {
    return NextResponse.json({ error: 'Pass not found.' }, { status: 404 });
  }

  if (auth.user.role === 'PRINT_TEAM' && existing.status !== 'PENDING_APPROVAL') {
    return NextResponse.json(
      { error: 'Print operators can edit only passes awaiting approval.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const isAdmin = auth.user.role === 'ADMIN';

    const sanitized: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        sanitized[field] = body[field];
      }
    }

    if (isAdmin) {
      for (const field of ADMIN_EXTRA_FIELDS) {
        if (field in body) {
          sanitized[field] = body[field];
        }
      }
    }

    if (sanitized.mobile_number) {
      validateMobile(sanitized.mobile_number as string);
    }

    const checkGovtType = (sanitized.govt_id_type as string) || existing.govt_id_type;
    const checkGovtNum = (sanitized.govt_id_number as string) || existing.govt_id_number;
    if (sanitized.govt_id_type || sanitized.govt_id_number) {
      validateGovernmentId(checkGovtType, checkGovtNum);
    }

    const updated = await services.passRepository.update(id, sanitized, auth.user);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update pass.';
    const isConflict = message.includes('already exists') || message.includes('Already present') || message.includes('matching pass already exists');
    return NextResponse.json({ error: message }, { status: isConflict ? 409 : message.endsWith('not found.') ? 404 : message.startsWith('Only unapproved') || message.startsWith('Print operators') ? 403 : 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  try {
    await services.passRepository.delete(id, auth.user);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete pass.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
