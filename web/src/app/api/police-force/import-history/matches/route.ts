import { NextResponse } from 'next/server';
import { canImportDistrictProforma } from '@/core/domain/offices';
import { query } from '@/infrastructure/db/pool';
import { authorizeRequest } from '@/lib/auth/session-helper';

interface Probe { row: number; aadhaar?: string; mobile?: string; name?: string; policeId?: string }
export interface ExistingMatch {
  pass_number: string;
  full_name: string;
  rank: string | null;
  police_id_number: string | null;
  mobile_number: string | null;
  govt_id_number: string | null;
  police_unit_district: string | null;
  /** What it shares with the row. */
  same: ('Aadhaar' | 'Mobile' | 'G.No + name')[];
}

const digits = (value?: string) => (value ?? '').replace(/\D/g, '');
const nameKey = (value?: string) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Re-review: officers already saved that share an Aadhaar, a mobile, or a G.No + name with held-back rows.
 * POST { rows: [{ row, aadhaar, mobile, name, policeId }] } -> { matches: { [row]: ExistingMatch[] } }
 */
export async function POST(req: Request) {
  const { user, errorResponse } = await authorizeRequest(req, ['ADMIN']);
  if (errorResponse) return errorResponse;
  if (!canImportDistrictProforma(user)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const probes: Probe[] = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 2000)
    .filter((item: Probe) => item && Number.isInteger(item.row));
  const aadhaars = [...new Set(probes.map(item => digits(item.aadhaar)).filter(value => value.length === 12))];
  const mobiles = [...new Set(probes.map(item => digits(item.mobile).slice(-10)).filter(value => value.length === 10))];
  const ids = [...new Set(probes.map(item => (item.policeId ?? '').trim().toLowerCase()).filter(Boolean))];
  if (!aadhaars.length && !mobiles.length && !ids.length) return NextResponse.json({ matches: {} });
  try {
    const { rows } = await query<Omit<ExistingMatch, 'same'>>(
      `SELECT pass_number, full_name, rank, police_id_number, mobile_number, govt_id_number, police_unit_district
         FROM passes
        WHERE pass_type = 'POLICE_FORCE' AND status <> 'REVOKED'
          AND (govt_id_number = ANY($1::text[])
               OR RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = ANY($2::text[])
               OR LOWER(BTRIM(police_id_number)) = ANY($3::text[]))
        LIMIT 5000`,
      [aadhaars, mobiles, ids],
    );
    const matches: Record<number, ExistingMatch[]> = {};
    for (const probe of probes) {
      const aadhaar = digits(probe.aadhaar);
      const mobile = digits(probe.mobile).slice(-10);
      const found = rows.flatMap(officer => {
        const same: ExistingMatch['same'] = [];
        if (aadhaar.length === 12 && officer.govt_id_number === aadhaar) same.push('Aadhaar');
        if (mobile.length === 10 && digits(officer.mobile_number ?? '').slice(-10) === mobile) same.push('Mobile');
        if (probe.policeId?.trim() && officer.police_id_number?.trim().toLowerCase() === probe.policeId.trim().toLowerCase()
          && nameKey(officer.full_name) === nameKey(probe.name)) same.push('G.No + name');
        return same.length ? [{ ...officer, same }] : [];
      });
      if (found.length) matches[probe.row] = found.slice(0, 5);
    }
    return NextResponse.json({ matches }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Import matches error:', error);
    return NextResponse.json({ error: 'Could not look up matching officers.' }, { status: 500 });
  }
}
