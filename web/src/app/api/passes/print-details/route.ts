import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { packPrintDetails } from '@/lib/print-details';

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM', 'POLICE_PRINT']);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 100 ||
    body.ids.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    return Response.json({ error: 'Select 1–100 valid passes.' }, { status: 400 });
  }

  const ids = [...new Set<string>(body.ids.map((id: string) => id.toLowerCase()))];
  const passes = await services.passRepository.findByIds(ids, auth.user);
  if (passes.length !== ids.length) {
    return Response.json({ error: 'One or more selected passes are unavailable.' }, { status: 404 });
  }
  return Response.json(packPrintDetails(passes), { headers: { 'Cache-Control': 'private, no-store' } });
}
