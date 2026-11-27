import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  // Police Force and Campus & Agencies have independent queues.
  const requestedType = searchParams.get('pass_type');
  const passType = auth.user.role === 'POLICE_PRINT' ? 'POLICE_FORCE'
    : auth.user.role === 'PRINT_TEAM' ? 'CAMPUS'
    : requestedType === 'POLICE_FORCE' || requestedType === 'CAMPUS' ? requestedType : undefined;
  const options = {
    passType,
    officeId: searchParams.get('office_id') || undefined,
    status: searchParams.get('status') || undefined,
    institution: searchParams.get('institution') || undefined,
    category: searchParams.get('category') || undefined,
    search: searchParams.get('search') || undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
    offset: parseInt(searchParams.get('offset') || '0', 10),
  };

  const result = await services.passRepository.list(options, true, auth.user);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const singleId = (body.id || '').toString().trim();
    let ids: string[] = [];

    if (singleId) {
      ids = [singleId];
    } else if (body.ids && Array.isArray(body.ids)) {
      ids = body.ids.map((id: unknown) => (id || '').toString().trim()).filter(Boolean);
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select 1–500 passes.' }, { status: 400 });
    }

    const { confirmationId } = body;
    if (confirmationId !== undefined &&
        (typeof confirmationId !== 'string' || !/^[a-f0-9]{32}$/.test(confirmationId))) {
      return NextResponse.json({ error: 'Invalid print confirmation.' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;
    if (body.reason !== undefined && (!singleId || !reason || reason.length < 3 || reason.length > 500)) {
      return NextResponse.json({ error: 'Enter a reprint reason of 3–500 characters.' }, { status: 400 });
    }

    const { expectedVersions } = body;
    if (expectedVersions !== undefined && (
      body.preview !== true || !expectedVersions || typeof expectedVersions !== 'object' ||
      Object.keys(expectedVersions).length !== new Set(ids).size ||
      ids.some(id => !Object.hasOwn(expectedVersions, id) || typeof expectedVersions[id] !== 'string' ||
        !Number.isFinite(Date.parse(expectedVersions[id])))
    )) {
      return NextResponse.json({ error: 'Invalid pass versions.' }, { status: 400 });
    }

    const now = new Date();
    const { printStartedAt } = body;
    if (printStartedAt !== undefined && (
      body.preview === true || !confirmationId || typeof printStartedAt !== 'string' ||
      !Number.isFinite(Date.parse(printStartedAt)) ||
      Date.parse(printStartedAt) > now.getTime() || now.getTime() - Date.parse(printStartedAt) > 86_400_000
    )) {
      return NextResponse.json({ error: 'Invalid or expired print session. Reopen the print preview.' }, { status: 400 });
    }

    const { updated, successCount } = await services.passRepository.recordPrintAction(
      ids,
      auth.user,
      reason,
      body.preview === true,
      confirmationId,
      expectedVersions,
      printStartedAt
    );

    if (singleId && body.preview !== true) {
      return NextResponse.json(updated[0]);
    }

    return NextResponse.json(body.preview === true ? { successCount, printStartedAt: now.toISOString() } : { successCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Print action failed.';
    const isForbidden = message.includes('Only approved cards');
    const isNotFound = message.includes('not found');
    return NextResponse.json(
      { error: message },
      { status: isForbidden ? 403 : isNotFound ? 404 : message.startsWith('The pass changed') ? 409 : 400 }
    );
  }
}
