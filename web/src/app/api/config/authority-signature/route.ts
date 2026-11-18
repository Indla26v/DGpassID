import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

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

  const config = await services.configRepository.getAuthoritySignature(auth.user);
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const signatureUrl = (body.signatureUrl || '').toString().trim();
    const name = (body.name || auth.user.name).toString().trim();
    const title = (body.title || '').toString().trim();
    if (name.length > 255 || title.length > 255) {
      return NextResponse.json({ error: 'Authority name and title must each be at most 255 characters.' }, { status: 400 });
    }

    if (
      !signatureUrl ||
      signatureUrl.length > 3_000_000 ||
      !(
        signatureUrl.startsWith('data:image/png;base64,') ||
        signatureUrl.startsWith('data:image/jpeg;base64,')
      )
    ) {
      return NextResponse.json(
        { error: 'Upload or draw a PNG or JPEG signature.' },
        { status: 400 }
      );
    }

    await services.configRepository.saveAuthoritySignature(signatureUrl, name, title, auth.user);

    return NextResponse.json({
      success: true,
      name,
      title,
    });
  } catch (error) {
    console.error('Update authority signature error:', error);
    return NextResponse.json({ error: 'Failed to update authority signature.' }, { status: 500 });
  }
}
