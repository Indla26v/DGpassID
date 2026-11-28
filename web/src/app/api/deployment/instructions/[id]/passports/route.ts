import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { services } from '@/core/services/service-container';
import { DEFAULT_SIGNATORY_DESIGNATION, intersectScopes, MAX_PASSPORTS } from '@/core/domain/duty-passport';
import { getInstruction } from '@/modules/deployment/instructions.repository';
import { deploymentScopeOf } from '@/modules/deployment/deployment.repository';
import { listPassportOfficers, listSectorSeniors, listZoneAccounts, passportCounts, type PassportFilters } from '@/modules/deployment/passports.repository';
import { currentIncharges } from '@/modules/deployment/incharges.repository';
import { listLocalOfficers } from '@/modules/deployment/local-officers.repository';
import { dutyPassportPdf } from '@/lib/duty-passport-pdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

/**
 * Duty passports (one A4 page per officer) for a duty instruction.
 * SP: officers in the instruction's targets. Zone / sector login: only those also in their own area.
 * ?zone=&sector=&subSector=&q=&ids=a,b filter the officers; ?summary=1 returns counts by sector instead of the PDF.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Duty passports are managed by the District SP office.' }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Instruction not found.' }, { status: 404 });

  try {
    const instruction = await getInstruction(id, auth.user);
    if (!instruction || instruction.status !== 'ACTIVE') return NextResponse.json({ error: 'Instruction not found.' }, { status: 404 });
    const areas = intersectScopes(instruction.targets, deploymentScopeOf(auth.user));

    const searchParams = new URL(req.url).searchParams;
    const text = (key: string, max: number) => (searchParams.get(key) ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const ids = [...new Set(searchParams.getAll('ids').flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean))];
    if (ids.some(value => !UUID.test(value)) || ids.length > MAX_PASSPORTS) {
      return NextResponse.json({ error: 'Choose valid officers.' }, { status: 400 });
    }
    const filters: PassportFilters = {
      zone: text('zone', 120) || undefined,
      sector: text('sector', 60) || undefined,
      subSector: text('subSector', 200) || undefined,
      search: text('q', 80) || undefined,
      ids: ids.length ? ids : undefined,
    };

    if (searchParams.get('summary')) {
      return NextResponse.json({ areas, counts: await passportCounts(areas, filters) });
    }

    const { total, officers } = await listPassportOfficers(areas, filters, MAX_PASSPORTS);
    if (!officers.length) return NextResponse.json({ error: 'No allotted officers match these filters.' }, { status: 400 });
    if (total > MAX_PASSPORTS) {
      return NextResponse.json({ error: `${total} officers match. Narrow it to a sector or sub-sector (at most ${MAX_PASSPORTS} per download).` }, { status: 400 });
    }

    const zonesPrinted = [...new Set(officers.map(officer => officer.police_zone).filter((zone): zone is string => Boolean(zone)))];
    const [accounts, authority, allotments, seniors, locals] = await Promise.all([
      listZoneAccounts(),
      services.configRepository.getAuthoritySignature('district'),
      currentIncharges(zonesPrinted),
      listSectorSeniors(zonesPrinted),
      listLocalOfficers(zonesPrinted),
    ]);
    const signatoryText = instruction.signatory?.trim() || [authority.name || 'Superintendent of Police', ...DEFAULT_SIGNATORY_DESIGNATION].join('\n');
    const pdf = dutyPassportPdf(instruction, officers, accounts, {
      imageUrl: authority.signatureUrl?.startsWith('data:image/') ? authority.signatureUrl : null,
      lines: signatoryText.split('\n').map(line => line.trim()).filter(Boolean),
    }, allotments, seniors, locals);

    void services.auditRepository.createLog({
      action: 'DUTY_PASSPORTS_PRINTED', performed_by: auth.user.email, user_role: auth.user.role,
      details: `${officers.length} duty passport${officers.length === 1 ? '' : 's'} for "${instruction.title}" (version ${instruction.version})` +
        `${filters.sector ? `, ${filters.sector}` : ''}${filters.subSector ? `, ${filters.subSector}` : ''}${filters.search ? `, search "${filters.search}"` : ''}${ids.length ? `, ${ids.length} chosen` : ''}.`,
    }).catch(error => console.error('Passport audit log failed:', error));

    const first = officers[0];
    const area = officers.every(officer => officer.police_zone === first.police_zone)
      ? [first.police_zone, officers.every(officer => officer.police_sector_number === first.police_sector_number) ? first.police_sector_number : ''].filter(Boolean).join(' ')
      : 'all';
    const name = officers.length === 1 ? `duty-passport-${slug(first.full_name)}` : `duty-passports-${slug(area ?? 'all')}`;
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name || 'duty-passports'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Duty passport error:', error);
    return NextResponse.json({ error: 'Could not prepare the duty passports.' }, { status: 500 });
  }
}
