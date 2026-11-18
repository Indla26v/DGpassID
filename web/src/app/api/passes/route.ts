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
  'pass_number',
  'office_id',
  'has_hologram',
  'has_official_seal',
];

function sanitizePassInput(body: Record<string, unknown>, isAdmin: boolean) {
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

  // Ensure booleans
  ['zone_a', 'zone_b', 'zone_c', 'has_hologram', 'has_official_seal'].forEach((key) => {
    if (key in sanitized) {
      sanitized[key] = Boolean(sanitized[key]);
    }
  });

  return sanitized;
}

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const options = {
    status: searchParams.get('status') || undefined,
    institution: searchParams.get('institution') || undefined,
    category: searchParams.get('category') || undefined,
    officeId: searchParams.get('office_id') || undefined,
    zone: (searchParams.get('zone') as 'A' | 'B' | 'C') || undefined,
    search: searchParams.get('search') || undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
    offset: parseInt(searchParams.get('offset') || '0', 10),
  };

  const result = await services.passRepository.list(options, false, auth.user);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();

    // Batch import handling
    if (body.records && Array.isArray(body.records)) {
      if (auth.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only administrators may import passes.' }, { status: 403 });
      }
      if (body.records.length > 500) {
        return NextResponse.json({ error: 'Import at most 500 records at once.' }, { status: 400 });
      }

      let created = 0;
      const errors: string[] = [];

      for (let i = 0; i < body.records.length; i++) {
        const record = body.records[i];
        try {
          validateMobile(record.mobile_number);
          validateGovernmentId(record.govt_id_type || 'Aadhaar', record.govt_id_number);
          const sanitized = sanitizePassInput(record, true);
          sanitized.status = record.status || 'READY_TO_PRINT';
          await services.passRepository.create(sanitized, auth.user);
          created++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid record.';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      return NextResponse.json({ created, errors }, { status: 201 });
    }

    // Single pass creation
    const fullName = (body.full_name || '').toString().trim();
    const mobileNumber = (body.mobile_number || '').toString().trim();
    const govtIdType = (body.govt_id_type || 'Aadhaar').toString().trim();
    const govtIdNumber = (body.govt_id_number || '').toString().trim();
    const department = (body.department || '').toString().trim();

    if (!fullName || !mobileNumber || !govtIdNumber || !department) {
      return NextResponse.json({ error: 'Full name, mobile number, government ID, and department are required.' }, { status: 400 });
    }

    validateMobile(mobileNumber);
    validateGovernmentId(govtIdType, govtIdNumber);

    const isAdmin = auth.user.role === 'ADMIN';
    const sanitized = sanitizePassInput(body, isAdmin);

    if (isAdmin) sanitized.status = body.status;

    sanitized.full_name = fullName;
    sanitized.mobile_number = mobileNumber;
    sanitized.govt_id_type = govtIdType;
    sanitized.govt_id_number = govtIdNumber;
    sanitized.department = department;

    const pass = await services.passRepository.create(sanitized, auth.user);
    return NextResponse.json(pass, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create pass.';
    const isConflict = message.includes('already exists') || message.includes('Already present') || message.includes('matching pass already exists');
    return NextResponse.json({ error: message }, { status: isConflict ? 409 : 400 });
  }
}
