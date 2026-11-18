import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { canAccessOffice, DUPLICATE_OUTSIDE_OFFICE } from '@/core/domain/offices';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const fullName = searchParams.get('full_name')?.trim() || '';
  const mobileNumber = searchParams.get('mobile_number')?.trim() || '';
  const govtIdNumber = searchParams.get('govt_id_number')?.trim() || '';
  const excludeId = searchParams.get('exclude_id')?.trim() || null;

  if (!fullName || !mobileNumber || !govtIdNumber) {
    return NextResponse.json({ isDuplicate: false });
  }

  try {
    const duplicate = await services.passRepository.findDuplicate(
      fullName,
      mobileNumber,
      govtIdNumber,
      excludeId
    );

    if (duplicate) {
      if (!canAccessOffice(auth.user, duplicate.office_id)) {
        return NextResponse.json({ isDuplicate: true, message: DUPLICATE_OUTSIDE_OFFICE });
      }
      return NextResponse.json({
        isDuplicate: true,
        passNumber: duplicate.pass_number,
        status: duplicate.status,
        fullName: duplicate.full_name,
        printedCount: duplicate.printed_count,
        message: `Already present: A pass for ${duplicate.full_name} with this mobile number and government ID is already saved or printed (Pass #${duplicate.pass_number}, Status: ${duplicate.status.replace(/_/g, ' ')}).`,
      });
    }

    return NextResponse.json({ isDuplicate: false });
  } catch (error) {
    console.error('Check duplicate error:', error);
    return NextResponse.json({ error: 'Failed to check duplicates.' }, { status: 500 });
  }
}
