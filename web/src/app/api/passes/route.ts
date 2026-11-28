import { NextResponse } from 'next/server';
import { query } from '@/infrastructure/db/pool';
import { canonicalStation, type MasterStation } from '@/core/domain/police-stations';
import { loadCustomDutyPoints } from '@/modules/deployment/custom-points.repository';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import {
  validateMobile, validateGovernmentId, cleanMobileNumber, cleanAadhaarNumber,
  DUPLICATE_PERSONNEL_AADHAAR, repeatedAadhaarNumbers,
} from '@/lib/identity-validation';
import { canImportDistrictProforma } from '@/core/domain/offices';
import { normalizeDistrict } from '@/core/domain/districts';
import { getDefaultGate } from '@/core/domain/zones';
import { InstitutionType } from '@/core/domain/types/pass-status.enum';
import { parsePoliceDutyAssignment } from '@/core/domain/police-zones';
import { normalizeForce, normalizeGender, normalizeRank } from '@/core/domain/ranks';
import { parseAgeYears, parseDateOfBirth } from '@/lib/officer-age';

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
  'pass_type',
  'rank',
  'police_id_number',
  'police_unit_district',
  'police_zone',
  'police_sector_number',
  'police_sector_name',
  'police_point_code',
  'police_point_name',
  'date_of_birth',
  'age_years',
  'force_category',
  'police_station',
  'gender',
  'police_custom_sector',
  'security_component',
  'custom_security_component',
  'issuing_counter_id',
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
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const policeBatch = searchParams.get('pass_type') === 'POLICE_FORCE' && searchParams.get('print_batch') === '1';
  const options = {
    status: policeBatch
      ? (searchParams.get('status') === 'PRINTED' ? 'PRINTED' : 'READY_TO_PRINT')
      : searchParams.get('status') || undefined,
    passType: searchParams.get('pass_type') || undefined,
    policeZone: searchParams.get('police_zone') || undefined,
    policeSector: searchParams.get('police_sector') || undefined,
    policeRank: searchParams.get('police_rank') || undefined,
    policeDistrict: searchParams.get('police_district') || undefined,
    issuingCounterId: searchParams.get('issuing_counter_id') || undefined,
    distributionStatus: searchParams.get('distribution_status') || undefined,
    institution: searchParams.get('institution') || undefined,
    category: searchParams.get('category') || undefined,
    officeId: searchParams.get('office_id') || undefined,
    zone: (searchParams.get('zone') as 'A' | 'B' | 'C') || undefined,
    search: searchParams.get('search') || undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
    offset: parseInt(searchParams.get('offset') || '0', 10),
    policePrintBatch: policeBatch,
    recentlyUpdated: !policeBatch && searchParams.get('pass_type') === 'POLICE_FORCE' &&
      searchParams.get('sort') === 'updated',
  };

  const result = await services.passRepository.list(options, false, auth.user);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();

    // Batch import handling
    if (body.records && Array.isArray(body.records)) {
      if (!canImportDistrictProforma(auth.user)) {
        return NextResponse.json({ error: 'Only District Head Office (SP) may import district proforma data.' }, { status: 403 });
      }
      if (body.records.length > 5000) {
        return NextResponse.json({ error: 'Import at most 5000 records at once.' }, { status: 400 });
      }

      let created = 0;
      let updated = 0;
      const errors: string[] = [];
      const warnings: string[] = [];
      const duplicateAadhaar = repeatedAadhaarNumbers(
        body.records.map((record: { govt_id_number?: unknown } | null) => String(record?.govt_id_number ?? '')),
      );
      // allowIncomplete: save every row that has a name. A bad mobile, Aadhaar or photo is left blank and reported
      // back in `flags` ("Row n: problem") for review, instead of failing the row.
      const allowIncomplete = body.allowIncomplete === true;
      // Duty point codes in the file may refer to points added in the app.
      await loadCustomDutyPoints().catch(() => undefined);
      // Police stations are saved with the master list's spelling when the name matches one in it.
      const masterStations: MasterStation[] = await query<MasterStation>('SELECT district, name, active FROM police_stations')
        .then(res => res.rows).catch(() => []);
      const flags: string[] = [];
      const aadhaarSeen = new Set<string>();

      for (let i = 0; i < body.records.length; i++) {
        const record = body.records[i];
        try {
          let mobile = cleanMobileNumber(record.mobile_number);
          let aadhaar = cleanAadhaarNumber(String(record.govt_id_number ?? ''));
          const rowFlags: string[] = [];
          if (allowIncomplete) {
            if (!String(record.full_name ?? '').trim()) throw new Error('Full Name is required.');
            try { validateMobile(mobile); } catch (error) {
              rowFlags.push(`Mobile ${String(record.mobile_number ?? '').trim() || '(blank)'}: ${error instanceof Error ? error.message : 'invalid'}`);
              mobile = '';
            }
            try {
              validateGovernmentId('Aadhaar', aadhaar);
              if (aadhaarSeen.has(aadhaar)) throw new Error(DUPLICATE_PERSONNEL_AADHAAR);
              aadhaarSeen.add(aadhaar);
            } catch (error) {
              rowFlags.push(`Aadhaar ${aadhaar ? `ending ${aadhaar.slice(-4)}` : '(blank)'}: ${error instanceof Error ? error.message : 'invalid'}`);
              aadhaar = '';
            }
          } else {
            validateMobile(mobile);
            validateGovernmentId('Aadhaar', aadhaar);
            if (duplicateAadhaar.has(aadhaar)) throw new Error(DUPLICATE_PERSONNEL_AADHAAR);
          }

          const sanitized = sanitizePassInput(record, true);
          sanitized.full_name = (record.full_name || '').toString().trim().toUpperCase();
          if (!sanitized.full_name) throw new Error('Full Name is required.');
          delete sanitized.father_or_spouse_name;
          sanitized.designation_or_trade = (record.designation_or_trade || record.rank || '').toString().trim().toUpperCase();
          sanitized.dept_hostel_quarter = (record.dept_hostel_quarter || '').toString().trim().toUpperCase();
          sanitized.institution = record.institution ? (record.institution as InstitutionType) : null;
          const district = (record.police_unit_district || record.institution_other || record.district || record.unit || '').toString().trim();
          sanitized.institution_other = district ? normalizeDistrict(district) : '';
          sanitized.department = 'Police department';
          sanitized.category = 'External Agency';
          sanitized.category_other = null;
          sanitized.personnel_type = 'EXTERNAL';
          sanitized.is_imported = true;
          sanitized.office_id = 'district';
          sanitized.govt_id_type = 'Aadhaar';
          sanitized.govt_id_number = aadhaar;
          sanitized.mobile_number = mobile;
          sanitized.status = record.status || undefined;
          const photo = typeof record.photo_url === 'string' ? record.photo_url.trim() : '';
          const photoValid = !photo || (photo.length <= 500_000 && /^(https?:\/\/[^\s]+$|data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$)/i.test(photo));
          if (!photoValid && !allowIncomplete) throw new Error('Use a valid photo link or a JPEG, PNG or WebP photo.');
          if (!photoValid) rowFlags.push('Photo could not be used: capture it at the desk.');
          sanitized.photo_url = photoValid ? photo || undefined : undefined;

          // Police Bandobusth Attributes
          sanitized.pass_type = 'POLICE_FORCE';
          sanitized.rank = normalizeRank((record.rank || record.designation_or_trade || '').toString());
          sanitized.designation_or_trade = sanitized.rank || sanitized.designation_or_trade;
          const dob = parseDateOfBirth(record.date_of_birth);
          const age = parseAgeYears(record.age_years);
          delete sanitized.date_of_birth;
          delete sanitized.age_years;
          if (dob) sanitized.date_of_birth = dob;
          if (age !== null) sanitized.age_years = age;
          // Force, police station and gender are optional: blanks keep the stored value
          // (new officers get force and gender derived from the rank).
          delete sanitized.force_category;
          delete sanitized.police_station;
          delete sanitized.gender;
          const force = String(record.force_category ?? '').trim();
          if (force) sanitized.force_category = normalizeForce(force, sanitized.rank as string);
          const typedStation = String(record.police_station ?? '').trim().replace(/\s+/g, ' ').slice(0, 255);
          const station = canonicalStation(masterStations, sanitized.institution_other as string, typedStation) ?? typedStation;
          if (station) sanitized.police_station = station;
          const gender = String(record.gender ?? '').trim();
          if (gender) sanitized.gender = normalizeGender(gender, sanitized.rank as string);
          sanitized.police_id_number = (record.police_id_number || record.id_number || record.gen_no || record.gl_no || '').toString().trim().toUpperCase();
          sanitized.police_unit_district = sanitized.institution_other;
          // Duty columns are optional. Rows without them keep the officer's existing allotment;
          // unrecognised values are dropped with a warning instead of failing the row.
          delete sanitized.police_point_code;
          delete sanitized.police_point_name;
          if (['police_zone', 'police_sector_number', 'police_sector_name', 'police_point_code'].some(key => key in record)) {
            const { dutyWarning, ...duty } = parsePoliceDutyAssignment(
              String(record.police_zone ?? '').trim(),
              String(record.police_sector_number ?? '').trim(),
              String(record.police_sector_name ?? '').trim(),
              '',
              String(record.police_point_code ?? '').trim(),
            );
            if (dutyWarning) warnings.push(`Row ${i + 1}: ${dutyWarning}`);
            Object.assign(sanitized, duty);
          }
          if (record.police_custom_sector) sanitized.police_custom_sector = record.police_custom_sector.toString().trim().toUpperCase();
          if (record.security_component) sanitized.security_component = record.security_component.toString().trim();
          if (record.issuing_counter_id) sanitized.issuing_counter_id = record.issuing_counter_id.toString().trim();

          sanitized.zone_a = Boolean(record.zone_a);
          sanitized.zone_b = Boolean(record.zone_b);
          sanitized.zone_c = Boolean(record.zone_c);
          sanitized.gate_zone_a = (sanitized.zone_a && sanitized.institution) ? getDefaultGate(sanitized.institution as string, 'A') : undefined;
          sanitized.gate_zone_b = (sanitized.zone_b && sanitized.institution) ? getDefaultGate(sanitized.institution as string, 'B') : undefined;
          sanitized.gate_zone_c = (sanitized.zone_c && sanitized.institution) ? getDefaultGate(sanitized.institution as string, 'C') : undefined;

          if (sanitized.pass_type === 'POLICE_FORCE') {
            const upsertRes = await services.passRepository.upsertPolicePass(sanitized, auth.user, { aadhaarConflictAsNew: allowIncomplete });
            if (upsertRes.conflictWith) {
              rowFlags.push(`Aadhaar ending ${aadhaar.slice(-4)} differs from ${upsertRes.conflictWith}, an officer with the same name and G.No / mobile: imported as a separate officer, check for a duplicate`);
            }
            if (upsertRes.isNew) {
              created++;
            } else {
              updated++;
            }
            if (rowFlags.length) flags.push(`Row ${i + 1}: ${rowFlags.join(' | ')}`);
          } else {
            await services.passRepository.create(sanitized, auth.user);
            created++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid record.';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      return NextResponse.json({ created, updated, total: created + updated, errors, warnings, flags }, { status: 201 });
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
