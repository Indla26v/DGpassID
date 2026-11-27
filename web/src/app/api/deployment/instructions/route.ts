import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { services } from '@/core/services/service-container';
import { describeTargets, targetsWithinScope, validateInstruction } from '@/core/domain/duty-instructions';
import { createInstruction, listInstructions } from '@/modules/deployment/instructions.repository';

/** SP: all duty instructions. Zone / sector login: active instructions sent to their area. */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty instructions are managed by the District SP office.' }, { status: 403 });
  }
  try {
    return NextResponse.json({ instructions: await listInstructions(auth.user) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('List instructions error:', error);
    return NextResponse.json({ error: 'Could not load the instructions.' }, { status: 500 });
  }
}

/** SP: create and send a duty instruction to any zones. Zone / sector login: only to their own zones and sectors. */
export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Only the District SP office can send duty instructions.' }, { status: 403 });
  }
  try {
    const checked = validateInstruction(await req.json().catch(() => null));
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    if (auth.user.role === 'BANDOBAST_OFFICER' && !targetsWithinScope(checked.value.targets, auth.user.policePrintScope ?? [])) {
      return NextResponse.json({ error: 'You can send instructions only to your own zones and sectors.' }, { status: 403 });
    }
    // Passports always carry the SP's saved name and signature; only the SP may change the "Signed by" text.
    if (auth.user.role !== 'ADMIN') checked.value.signatory = '';
    const instruction = await createInstruction(checked.value, auth.user);
    void services.auditRepository.createLog({
      action: 'DUTY_INSTRUCTION_CREATED',
      performed_by: auth.user.email,
      user_role: auth.user.role,
      details: `Duty instruction "${instruction.title}" sent to ${describeTargets(instruction.targets)}.`,
    }).catch(error => console.error('Instruction audit log failed:', error));
    return NextResponse.json({ instruction }, { status: 201 });
  } catch (error) {
    console.error('Create instruction error:', error);
    return NextResponse.json({ error: 'Could not send the instruction.' }, { status: 500 });
  }
}
