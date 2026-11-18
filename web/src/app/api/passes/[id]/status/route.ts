import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { PassStatus } from '@/core/domain/types/pass-status.enum';

const VALID_STATUSES: PassStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'READY_TO_PRINT',
  'PRINTED',
  'ISSUED',
  'REVOKED',
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const status = body.status as PassStatus;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid pass status.' }, { status: 400 });
    }

    const updated = await services.passRepository.updateStatus(id, status, auth.user);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update status.';
    return NextResponse.json({ error: message }, { status: message === 'Pass not found.' ? 404 : 400 });
  }
}
