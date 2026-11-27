import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { canAccessOffice, isOfficeId } from '@/core/domain/offices';
import type { SignaturePreset } from '@/core/interfaces/config-repository.interface';

function isSignatureImage(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1_800_000 &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function isSignaturePreset(value: unknown): value is SignaturePreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<SignaturePreset>;
  const within = (number: unknown, min: number, max: number) =>
    typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max;
  return isSignatureImage(preset.sourceUrl) &&
    typeof preset.fittedSource === 'boolean' && typeof preset.cleanBackground === 'boolean' &&
    within(preset.scale, 0.4, 2.8) && within(preset.offsetX, -45, 45) &&
    within(preset.offsetY, -25, 25) && within(preset.rotation, -15, 15);
}

export async function DELETE(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    await services.configRepository.removeAuthoritySignature(auth.user);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove authority signature.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  const requested = new URL(req.url).searchParams.get('officeId');
  if (requested !== null && requested !== 'unassigned' && !isOfficeId(requested)) {
    return NextResponse.json({ error: 'Choose a valid issuing office.' }, { status: 400 });
  }
  const officeId = requested === null ? auth.user.officeId : isOfficeId(requested) ? requested : null;
  if (!canAccessOffice(auth.user, officeId)) {
    return NextResponse.json({ error: 'You cannot view this issuing office’s signature.' }, { status: 403 });
  }
  const config = await services.configRepository.getAuthoritySignature(officeId, requested === null && auth.user.role === 'ADMIN');
  if (requested === null) {
    return NextResponse.json(config, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const body = JSON.stringify(config);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = { 'Cache-Control': 'private, no-cache', ETag: etag, Vary: 'Cookie' };
  if (req.headers.get('if-none-match')?.split(',').some(tag => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const signatureUrl = typeof body.signatureUrl === 'string' ? body.signatureUrl.trim() : null;
    const name = typeof body.name === 'string' ? body.name.trim() : auth.user.name;
    const title = (body.title || '').toString().trim();
    if (!name) {
      return NextResponse.json({ error: 'Enter the authority signatory name.' }, { status: 400 });
    }
    if (name.length > 255 || title.length > 255) {
      return NextResponse.json({ error: 'Authority name and title must each be at most 255 characters.' }, { status: 400 });
    }

    if (body.signatureUrl != null && !isSignatureImage(signatureUrl)) {
      return NextResponse.json(
        { error: 'Upload or draw a PNG or JPEG signature.' },
        { status: 400 }
      );
    }
    const preset = body.preset;
    if (preset !== undefined && (!signatureUrl || !isSignaturePreset(preset))) {
      return NextResponse.json({ error: 'The signature adjustments or source image are invalid.' }, { status: 400 });
    }

    const updatedCount = await services.configRepository.saveAuthoritySignature(
      signatureUrl, name, title, auth.user, body.applyToUnprinted === true, preset
    );

    return NextResponse.json({
      success: true,
      name,
      title,
      updatedCount,
    });
  } catch (error) {
    console.error('Update authority signature error:', error);
    return NextResponse.json({ error: 'Failed to update authority signature.' }, { status: 500 });
  }
}
