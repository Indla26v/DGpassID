import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/auth/session-helper';
import { managesAccounts } from '@/core/domain/offices';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { FORCE_LABELS, RANK_GROUPS, isForceCategory } from '@/core/domain/ranks';
import { services } from '@/core/services/service-container';
import { deploymentScopeOf, listOfficersForExport, type PoliceExportFilters } from '@/modules/deployment/deployment.repository';
import { policeExportCsv, policeExportPdf, policeExportXlsx } from '@/lib/police-export';

/**
 * SP (any zone) or zone/sector officer (own zones and sectors only). Police Force personnel with combinable filters:
 * zones, sector, districts, ranks (rank groups, e.g. "ASI/HC"), force, duty. Multi-value filters repeat the
 * parameter (zones=A&zones=B) because zone and district names can contain commas.
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

  const list = (key: string) => [...new Set(searchParams.getAll(key).map(item => item.trim()).filter(Boolean))].slice(0, 100);
  const zoneNames = [...new Set([...list('zones'), ...(searchParams.get('zone') ? [searchParams.get('zone') as string] : [])])];
  const zones = zoneNames.map(name => POLICE_BANDOBUSHT_ZONES.find(item => item.name === name));
  if (zones.some(item => !item)) return NextResponse.json({ error: 'Choose zones from the scheme.' }, { status: 400 });
  const chosenZones = zones as NonNullable<(typeof zones)[number]>[];
  const zone = chosenZones.length === 1 ? chosenZones[0] : undefined;
  if (searchParams.get('sector') && !zone) return NextResponse.json({ error: 'Choose exactly one zone to filter by sector.' }, { status: 400 });
  const sector = searchParams.get('sector') ? zone?.sectors.find(item => item.number === searchParams.get('sector')) : undefined;
  if (searchParams.get('sector') && !sector) return NextResponse.json({ error: 'Choose a sector inside the zone.' }, { status: 400 });

  // Zone / sector officers export only inside their own scope.
  const scope = deploymentScopeOf(auth.user);
  let scopePairs: { zone: string; sector: string | null; subSector?: string | null }[] | undefined;
  if (scope !== 'ALL') {
    const targetZones = chosenZones.length ? chosenZones.map(item => item.name) : [...new Set(scope.map(item => item.zone))];
    scopePairs = [];
    for (const name of targetZones) {
      const zoneScopes = scope.filter(item => item.zone === name);
      if (!zoneScopes.length) return NextResponse.json({ error: 'A chosen zone is not assigned to you.' }, { status: 403 });
      if (zoneScopes.some(item => item.sector === null)) scopePairs.push({ zone: name, sector: null });
      else zoneScopes.forEach(item => scopePairs!.push({ zone: name, sector: item.sector, subSector: item.subSector ?? null }));
    }
    if (sector && zone && !scopePairs.some(pair => pair.zone === zone.name && (pair.sector === null || pair.sector === sector.number))) {
      return NextResponse.json({ error: 'This sector is not assigned to you.' }, { status: 403 });
    }
  }

  const groups = list('ranks').map(group => RANK_GROUPS.find(item => item.group === group)).filter(Boolean);
  const duty = searchParams.get('duty');
  const force = searchParams.get('force') || '';
  if (force && !isForceCategory(force)) return NextResponse.json({ error: 'Choose a force category.' }, { status: 400 });
  const filters: PoliceExportFilters = {
    zones: chosenZones.map(item => item.name),
    sectorNumber: sector?.number,
    scopePairs,
    districts: list('districts'),
    ranks: groups.flatMap(group => [...group!.ranks]),
    force: force || undefined,
    duty: duty === 'ALLOTTED' || duty === 'NOT_ALLOTTED' || duty === 'ON_POINT' ? duty : undefined,
  };

  try {
    const { total, rows } = await listOfficersForExport(filters, format === 'json' ? 100 : 20000);
    if (format === 'json') return NextResponse.json({ total, preview: rows });

    const summary = [
      chosenZones.length ? chosenZones.map(item => `Zone ${item.number}: ${item.name}`).join(', ') : scope === 'ALL' ? 'All zones' : 'All my zones',
      sector ? `${sector.number}: ${sector.name}` : null,
      filters.districts.length ? `Districts: ${filters.districts.join(', ')}` : 'All districts',
      groups.length ? `Ranks: ${groups.map(group => group!.group).join(', ')}` : 'All ranks',
      isForceCategory(force) ? `Force: ${FORCE_LABELS[force]}` : 'All forces',
      filters.duty ? { ALLOTTED: 'Allotted', NOT_ALLOTTED: 'Not allotted', ON_POINT: 'On a duty point' }[filters.duty] : null,
    ].filter(Boolean).join(' · ');
    const stamp = new Date().toISOString().slice(0, 10);
    const zonePart = chosenZones.length ? `zone-${chosenZones.map(item => item.number).join('-')}${sector ? `-s${sector.number.replace(/\D/g, '')}` : ''}` : 'all';
    const name = `police-force-${zonePart}-${stamp}`;

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
    if (format === 'csv') return new Response(policeExportCsv(rows, summary), { headers: headers('text/csv; charset=utf-8', 'csv') });
    if (format === 'xlsx') {
      return new Response(Buffer.from(policeExportXlsx(rows, summary)), {
        headers: headers('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'),
      });
    }
    return new Response(Buffer.from(policeExportPdf(rows, summary)), { headers: headers('application/pdf', 'pdf') });
  } catch (error) {
    console.error('Police export error:', error);
    return NextResponse.json({ error: 'Could not export the police personnel list.' }, { status: 500 });
  }
}
