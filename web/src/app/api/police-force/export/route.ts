import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { RANK_GROUPS } from '@/core/domain/ranks';
import { services } from '@/core/services/service-container';
import { deploymentScopeOf, listOfficersForExport, type PoliceExportFilters } from '@/modules/deployment/deployment.repository';
import { policeExportCsv, policeExportPdf, policeExportXlsx } from '@/lib/police-export';

/**
 * SP (any zone) or zone/sector officer (own zones and sectors only). Police Force roster with combinable filters:
 * zone, sector, districts (comma-separated), ranks (comma-separated rank groups, e.g. "ASI/HC,DSP"), duty.
 * format=json returns the count and a preview; csv | xlsx | pdf return a file.
 */
export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN', 'BANDOBAST_OFFICER']);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.role === 'ADMIN' && !managesAccounts(auth.user)) {
    return NextResponse.json({ error: 'Police Force export is restricted to the District SP office.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') || 'json').toLowerCase();
  if (!['json', 'csv', 'xlsx', 'pdf'].includes(format)) return NextResponse.json({ error: 'Choose CSV, Excel or PDF.' }, { status: 400 });

  const zone = searchParams.get('zone') ? POLICE_BANDOBUSHT_ZONES.find(item => item.name === searchParams.get('zone')) : undefined;
  if (searchParams.get('zone') && !zone) return NextResponse.json({ error: 'Choose a zone from the scheme.' }, { status: 400 });
  const sector = searchParams.get('sector') ? zone?.sectors.find(item => item.number === searchParams.get('sector')) : undefined;
  if (searchParams.get('sector') && !sector) return NextResponse.json({ error: 'Choose a sector inside the zone.' }, { status: 400 });

  // Zone / sector officers export only inside their own scope.
  const scope = deploymentScopeOf(auth.user);
  let sectorNumbers: string[] | undefined;
  if (scope !== 'ALL') {
    if (!zone) return NextResponse.json({ error: 'Choose one of your zones.' }, { status: 400 });
    const zoneScopes = scope.filter(item => item.zone === zone.name);
    if (!zoneScopes.length) return NextResponse.json({ error: 'This zone is not assigned to you.' }, { status: 403 });
    if (!zoneScopes.some(item => item.sector === null)) {
      const allowed = zoneScopes.map(item => item.sector as string);
      if (sector && !allowed.includes(sector.number)) {
        return NextResponse.json({ error: 'This sector is not assigned to you.' }, { status: 403 });
      }
      if (!sector) sectorNumbers = allowed;
    }
  }

  const list = (key: string) => (searchParams.get(key) || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 100);
  const groups = list('ranks').map(group => RANK_GROUPS.find(item => item.group === group)).filter(Boolean);
  const duty = searchParams.get('duty');
  const filters: PoliceExportFilters = {
    zone: zone?.name,
    sectorNumber: sector?.number,
    sectorNumbers,
    districts: list('districts'),
    ranks: groups.flatMap(group => [...group!.ranks]),
    duty: duty === 'ALLOTTED' || duty === 'NOT_ALLOTTED' || duty === 'ON_POINT' ? duty : undefined,
  };

  try {
    const { total, rows } = await listOfficersForExport(filters, format === 'json' ? 100 : 20000);
    if (format === 'json') return NextResponse.json({ total, preview: rows });

    const summary = [
      zone ? `Zone ${zone.number}: ${zone.name}` : 'All zones',
      sector ? `${sector.number}: ${sector.name}` : null,
      filters.districts.length ? `Districts: ${filters.districts.join(', ')}` : 'All districts',
      groups.length ? `Ranks: ${groups.map(group => group!.group).join(', ')}` : 'All ranks',
      filters.duty ? { ALLOTTED: 'Allotted', NOT_ALLOTTED: 'Not allotted', ON_POINT: 'On a duty point' }[filters.duty] : null,
    ].filter(Boolean).join(' · ');
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `police-force-${zone ? `zone-${zone.number}${sector ? `-${sector.number.replace(/\D/g, '')}` : ''}` : 'all'}-${stamp}`;

    void services.auditRepository.createLog({
      action: 'DATA_EXPORT',
      performed_by: auth.user.email,
      user_role: auth.user.role,
      details: `Police Force export (${format.toUpperCase()}): ${rows.length} officers. ${summary}.`,
    }).catch(error => console.error('Export audit log failed:', error));

    const headers = (type: string, ext: string) => ({
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name}.${ext}"`,
      'Cache-Control': 'no-store',
    });
    if (format === 'csv') return new Response(policeExportCsv(rows), { headers: headers('text/csv; charset=utf-8', 'csv') });
    if (format === 'xlsx') {
      return new Response(Buffer.from(policeExportXlsx(rows, summary)), {
        headers: headers('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'),
      });
    }
    return new Response(Buffer.from(policeExportPdf(rows, summary)), { headers: headers('application/pdf', 'pdf') });
  } catch (error) {
    console.error('Police export error:', error);
    return NextResponse.json({ error: 'Could not export the police roster.' }, { status: 500 });
  }
}
