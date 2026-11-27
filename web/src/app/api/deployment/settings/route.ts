import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { getAgeCutoffYears, setAgeCutoffYears } from '@/modules/deployment/deployment.repository';
import { services } from '@/core/services/service-container';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  return NextResponse.json({ ageCutoffYears: await getAgeCutoffYears() });
}

/** SP only: changes the age at which an officer counts as "old" for ASI/HC selection. */
export async function PUT(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { ageCutoffYears } = await req.json();
    if (!Number.isInteger(ageCutoffYears) || ageCutoffYears < 20 || ageCutoffYears > 70) {
      return NextResponse.json({ error: 'Enter an age between 20 and 70.' }, { status: 400 });
    }
    await setAgeCutoffYears(ageCutoffYears);
    await services.auditRepository.createLog({
      action: 'AGE_CUTOFF_UPDATED',
      performed_by: auth.user.email,
      user_role: auth.user.role,
      details: `Old/young age cutoff set to ${ageCutoffYears} years.`,
    });
    return NextResponse.json({ ageCutoffYears });
  } catch (error) {
    console.error('Age cutoff update error:', error);
    return NextResponse.json({ error: 'Could not save the age cutoff.' }, { status: 500 });
  }
}
