import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'PRINT_TEAM']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0 || ids.length > 500) {
      return NextResponse.json({ error: 'Select 1–500 passes to assign zones.' }, { status: 400 });
    }

    const zones = {
      zone_a: Boolean(body.zone_a),
      zone_b: Boolean(body.zone_b),
      zone_c: Boolean(body.zone_c),
      gate_zone_a: typeof body.gate_zone_a === 'string' ? body.gate_zone_a.trim() : undefined,
      gate_zone_b: typeof body.gate_zone_b === 'string' ? body.gate_zone_b.trim() : undefined,
      gate_zone_c: typeof body.gate_zone_c === 'string' ? body.gate_zone_c.trim() : undefined,
      dept_hostel_quarter: typeof body.dept_hostel_quarter === 'string' ? body.dept_hostel_quarter.trim().toUpperCase() : undefined,
    };

    const result = await services.passRepository.bulkAssignZones(ids, zones, auth.user);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to assign zones.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
