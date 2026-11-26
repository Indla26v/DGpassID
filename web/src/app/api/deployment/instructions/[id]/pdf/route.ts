import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { getInstruction } from '@/modules/deployment/instructions.repository';
import { instructionPdf } from '@/lib/instruction-pdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PDF of one duty instruction: SP, or a zone / sector login it was sent to. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty instructions are managed by the District SP office.' }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Instruction not found.' }, { status: 404 });
  try {
    const instruction = await getInstruction(id, auth.user);
    if (!instruction) return NextResponse.json({ error: 'Instruction not found.' }, { status: 404 });
    const name = `duty-instruction-${instruction.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'instruction'}-v${instruction.version}`;
    return new Response(Buffer.from(instructionPdf(instruction)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Instruction PDF error:', error);
    return NextResponse.json({ error: 'Could not prepare the PDF.' }, { status: 500 });
  }
}
