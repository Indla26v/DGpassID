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
  'photo_url',
  'cardholder_signature_url',
  'rank',
  'police_id_number',
  'police_unit_district',
  'police_station',
  'police_zone',
  'police_sector_number',
  'police_sector_name',
  'police_point_code',
  'police_point_name',
  'date_of_birth',
  'age_years',
  'police_custom_sector',
  'security_component',
  'custom_security_component',
  'issuing_counter_id',
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
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const pass = await services.passRepository.findById(id, auth.user);
  if (!pass) {
    return NextResponse.json({ error: 'Pass not found.' }, { status: 404 });
  }

  return NextResponse.json(pass, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const existing = await services.passRepository.findById(id, auth.user);
  if (!existing) {
    return NextResponse.json({ error: 'Pass not found.' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const isAdmin = auth.user.role === 'ADMIN';
    if (auth.user.role === 'POLICE_PRINT' && (
      !body || Object.keys(body).length !== 1 || typeof body.photo_url !== 'string' ||
      body.photo_url.length > 2_000_000 || !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(body.photo_url)
    )) {
      return NextResponse.json({ error: 'Police print operators may only upload a badge photograph.' }, { status: 403 });
    }

    const allowedCounterFields = new Set([
      'photo_url',
      'institution',
      'zone_a',
      'zone_b',
      'zone_c',
      'gate_zone_a',
      'gate_zone_b',
      'gate_zone_c',
      'police_zone',
      'police_sector_number',
      'police_sector_name',
      'police_custom_sector',
      'security_component',
      'issuing_counter_id',
    ]);
    const isCounterUpdate = Object.keys(body).length > 0 && Object.keys(body).every((k) => allowedCounterFields.has(k));

    if (auth.user.role === 'PRINT_TEAM' && existing.status !== 'PENDING_APPROVAL' && !isCounterUpdate) {
      return NextResponse.json(
        { error: 'Print operators can edit only passes awaiting approval.' },
        { status: 403 }
      );
    }

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

export const PATCH = PUT;
