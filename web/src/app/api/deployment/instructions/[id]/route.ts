import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { services } from '@/core/services/service-container';
import { describeTargets, validateInstruction } from '@/core/domain/duty-instructions';
import { updateInstruction, withdrawInstruction } from '@/modules/deployment/instructions.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SP only: edit a sent instruction (with a note on what changed) or withdraw it ({ action: 'withdraw' }). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  if (!managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Only the District SP office can change duty instructions.' }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Instruction not found.' }, { status: 404 });

  try {
    const body = await req.json().catch(() => null);
    if (body?.action === 'withdraw') {
      const instruction = await withdrawInstruction(id, auth.user);
      if (!instruction) return NextResponse.json({ error: 'This instruction is not active.' }, { status: 404 });
      void services.auditRepository.createLog({
        action: 'DUTY_INSTRUCTION_WITHDRAWN', performed_by: auth.user.email, user_role: auth.user.role,
        details: `Duty instruction "${instruction.title}" withdrawn from ${describeTargets(instruction.targets)}.`,
      }).catch(error => console.error('Instruction audit log failed:', error));
      return NextResponse.json({ instruction });
    }

    const note = String(body?.revisionNote ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!note) return NextResponse.json({ error: 'Say briefly what changed.' }, { status: 400 });
    const checked = validateInstruction(body);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    const instruction = await updateInstruction(id, checked.value, note, auth.user);
    if (!instruction) return NextResponse.json({ error: 'This instruction is not active.' }, { status: 404 });
    void services.auditRepository.createLog({
      action: 'DUTY_INSTRUCTION_UPDATED', performed_by: auth.user.email, user_role: auth.user.role,
      details: `Duty instruction "${instruction.title}" updated to version ${instruction.version} (${note}). Sent to ${describeTargets(instruction.targets)}.`,
    }).catch(error => console.error('Instruction audit log failed:', error));
    return NextResponse.json({ instruction });
  } catch (error) {
    console.error('Update instruction error:', error);
    return NextResponse.json({ error: 'Could not save the instruction.' }, { status: 500 });
  }
}
