import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { isForceCategory } from '@/core/domain/ranks';
import { loadPoliceDashboard } from '@/modules/deployment/dashboard';
import { schemePdf } from '@/lib/scheme-pdf';

/** SP only: the zone-wise bandobast scheme as a PDF, counted from the officers allotted now (?force=&zone= optional). */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN'], true);
  if (auth.errorResponse) return auth.errorResponse;
  if (!managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'The bandobast scheme print is restricted to the District SP office.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') || '';
  const zone = searchParams.get('zone') || '';
  const district = (searchParams.get('district') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (force && !isForceCategory(force)) return NextResponse.json({ error: 'Choose a force category.' }, { status: 400 });
  if (zone && !POLICE_BANDOBUSHT_ZONES.some(item => item.name === zone)) return NextResponse.json({ error: 'Choose a zone from the scheme.' }, { status: 400 });

  try {
    const data = await loadPoliceDashboard({ force: force || undefined, zone: zone || undefined, district: district || undefined });
    const pdf = schemePdf(data, { force: force || undefined, zone: zone || undefined, district: district || undefined });
    const date = new Date().toISOString().slice(0, 10);
    const name = `zone-wise-bb-scheme-${[force.toLowerCase(), zone ? `zone-${POLICE_BANDOBUSHT_ZONES.find(item => item.name === zone)?.number}` : '', district.toLowerCase().replace(/[^a-z0-9]+/g, '-'), date].filter(Boolean).join('-')}`;
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Scheme PDF error:', error);
    return NextResponse.json({ error: 'Could not prepare the scheme PDF.' }, { status: 500 });
  }
}
