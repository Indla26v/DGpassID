'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { PillButton } from '../common/PillButton';
import { POLICE_BANDOBUSHT_ZONES, resolveDutyPosting } from '@/core/domain/police-zones';
import { AP_DISTRICTS, POLICE_SPECIAL_UNITS } from '@/core/domain/districts';
import { displayRank, FORCE_CATEGORIES, FORCE_LABELS, RANK_GROUPS } from '@/core/domain/ranks';
import type { PoliceExportRow } from '@/modules/deployment/deployment.repository';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';

type Duty = '' | 'ALLOTTED' | 'NOT_ALLOTTED' | 'ON_POINT';

/** Police Force export: combine zone, sector, districts, ranks and duty state, preview, then download. */
export function PoliceExportPanel({ knownDistricts, scope }: {
  knownDistricts: string[];
  /** Zone / sector officer scope: limits zones and sectors to it. Omit for the SP (all zones). */
  scope?: PolicePrintScope[];
}) {
  const scopedZones = scope ? POLICE_BANDOBUSHT_ZONES.filter(item => scope.some(entry => entry.zone === item.name)) : POLICE_BANDOBUSHT_ZONES;
  const zoneLabel = (item: (typeof POLICE_BANDOBUSHT_ZONES)[number]) => `Zone ${item.number}: ${item.name}`;
  const [zoneNames, setZoneNames] = useState<string[]>([]);
  // Sector filtering needs exactly one zone.
  const zoneName = zoneNames.length === 1 ? zoneNames[0] : '';
  const [sectorNumber, setSectorNumber] = useState('');
  const [districts, setDistricts] = useState<string[]>([]);
  const [ranks, setRanks] = useState<string[]>([]);
  const [duty, setDuty] = useState<Duty>('');
  const [force, setForce] = useState('');
  const [preview, setPreview] = useState<{ total: number; rows: PoliceExportRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
  const wholeZone = !scope || scope.some(entry => entry.zone === zoneName && entry.sector === null);
  const zoneSectors = (zone?.sectors ?? []).filter(item => wholeZone || scope?.some(entry => entry.zone === zoneName && entry.sector === item.number));
  const districtOptions = useMemo(() => {
    const all = new Map<string, string>();
    for (const name of [...knownDistricts, ...AP_DISTRICTS, ...POLICE_SPECIAL_UNITS]) all.set(name.toLowerCase(), name);
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  }, [knownDistricts]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    zoneNames.forEach(name => params.append('zones', name));
    if (sectorNumber) params.set('sector', sectorNumber);
    districts.forEach(name => params.append('districts', name));
    ranks.forEach(name => params.append('ranks', name));
    if (duty) params.set('duty', duty);
    if (force) params.set('force', force);
    return params.toString();
  }, [zoneNames, sectorNumber, districts, ranks, duty, force]);

  // Live count and preview as filters change.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/police-force/export?format=json${query ? `&${query}` : ''}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the preview.');
        setPreview({ total: data.total, rows: data.preview });
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load the preview.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const hasFilters = Boolean(zoneNames.length || sectorNumber || districts.length || ranks.length || duty || force);
  const clear = () => { setZoneNames([]); setSectorNumber(''); setDistricts([]); setRanks([]); setDuty(''); setForce(''); };
  const href = (format: string) => `/api/police-force/export?format=${format}${query ? `&${query}` : ''}`;
  const disabled = loading || !preview?.total;

  // Fetch the file first so a server error is shown here instead of being saved as a file.
  const download = async (format: string) => {
    setDownloading(format);
    setError('');
    try {
      const response = await fetch(href(format), { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not prepare the download.');
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `police-force.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the download.');
    } finally {
      setDownloading('');
    }
  };
  const label = 'block text-xs font-semibold text-slate-700';

  return (
    <section aria-label="Police Force export" className="operations-panel operations-enter space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-police-navy">Export police personnel</h2>
        <p className="text-sm text-slate-600" aria-live="polite">
          <span className="font-semibold text-police-navy">{loading ? 'Counting…' : `${(preview?.total ?? 0).toLocaleString()} officers`}</span>
          {' '}match these filters
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Zones</span>
          <MultiSelectDropdown ariaLabel="Zones" emptyLabel={scope ? 'All my zones' : 'All zones'}
            options={scopedZones.map(zoneLabel)}
            value={scopedZones.filter(item => zoneNames.includes(item.name)).map(zoneLabel)}
            onChange={labels => {
              setZoneNames(scopedZones.filter(item => labels.includes(zoneLabel(item))).map(item => item.name));
              setSectorNumber('');
            }} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Sector</span>
          <CustomSelect ariaLabel="Sector" value={sectorNumber} onChange={setSectorNumber} disabled={!zone} searchable
            options={[{ value: '', label: zone ? (scope && !wholeZone ? 'All my sectors' : 'All sectors') : zoneNames.length > 1 ? 'Pick one zone to filter by sector' : 'Choose a zone first' },
              ...zoneSectors.map(item => ({ value: item.number, label: `${item.number}: ${item.name}` }))]} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Districts / units</span>
          <MultiSelectDropdown ariaLabel="Districts / units" options={districtOptions} value={districts} onChange={setDistricts} emptyLabel="All districts / units" />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Ranks</span>
          <MultiSelectDropdown ariaLabel="Ranks" options={RANK_GROUPS.map(item => item.group)} value={ranks} onChange={setRanks} emptyLabel="All ranks" />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Force</span>
          <CustomSelect ariaLabel="Force" value={force} onChange={setForce}
            options={[{ value: '', label: 'All forces' }, ...FORCE_CATEGORIES.map(item => ({ value: item, label: FORCE_LABELS[item] }))]} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={label}>Duty</span>
          <CustomSelect ariaLabel="Duty" value={duty} onChange={value => setDuty(value as Duty)}
            options={[
              { value: '', label: 'Any duty status' },
              { value: 'ALLOTTED', label: 'Allotted to a zone' },
              ...(scope ? [] : [{ value: 'NOT_ALLOTTED', label: 'Not allotted' }]),
              { value: 'ON_POINT', label: 'Placed on a point' },
            ]} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-2">
        {hasFilters && (
          <PillButton type="button" size="sm" variant="outline" icon={<RotateCcw aria-hidden="true" className="size-3.5" />} onClick={clear}>
            Clear filters
          </PillButton>
        )}
        <span className="text-xs text-slate-600">Download {preview?.total ? `${preview.total.toLocaleString()} officers` : ''} as</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {[
            { format: 'xlsx', text: 'Excel', Icon: FileSpreadsheet },
            { format: 'csv', text: 'CSV', Icon: Download },
            { format: 'pdf', text: 'PDF', Icon: FileText },
          ].map(({ format, text, Icon }) => (
            <button key={format} type="button" disabled={disabled || Boolean(downloading)} onClick={() => download(format)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-sm ${disabled || downloading
                ? 'cursor-not-allowed bg-slate-100 text-slate-400' : format === 'xlsx' ? 'bg-police-crimson text-white hover:bg-police-crimsonLight' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <Icon aria-hidden="true" className="size-3.5" /> {downloading === format ? 'Preparing…' : text}
            </button>
          ))}
        </span>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}

      <div role="region" aria-label="Export preview" tabIndex={0} className="max-h-[30rem] overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-xs">
          <caption className="sr-only">First 100 matching officers</caption>
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-slate-600">
              {['Officer', 'Rank', 'District / unit', 'Zone', 'Sector / sub-sector', 'Point'].map(head => (
                <th key={head} scope="col" className="px-2 py-2 font-semibold">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-60' : ''}`}>
            {(preview?.rows ?? []).map(row => {
              const posting = resolveDutyPosting(row.police_zone, row.police_sector_number, row.police_sector_name);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <th scope="row" className="px-2 py-1.5 font-normal">
                    <span className="block font-semibold text-slate-900">{row.full_name}</span>
                    <span className="text-slate-500">{[row.police_id_number, row.mobile_number, row.police_station].filter(Boolean).join(' · ')}</span>
                  </th>
                  <td className="px-2 py-1.5 font-semibold text-police-crimson">{displayRank(row.rank)}</td>
                  <td className="px-2 py-1.5">{row.district}{row.force_category && <span className="block text-slate-500">{FORCE_LABELS[row.force_category as keyof typeof FORCE_LABELS] ?? row.force_category}</span>}</td>
                  <td className="px-2 py-1.5">{row.police_zone || <span className="text-rose-700">Not allotted</span>}</td>
                  <td className="px-2 py-1.5 text-slate-600">
                    {row.police_sector_number ? `${row.police_sector_number}${posting.subSector ? ` · ${posting.subSector}` : ''}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{row.police_point_name || '—'}</td>
                </tr>
              );
            })}
            {!loading && !(preview?.rows.length) && (
              <tr><td colSpan={6} className="p-5 text-center text-slate-500">No officers match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {preview && preview.total > preview.rows.length && (
        <p className="text-xs text-slate-500">Showing the first {preview.rows.length} of {preview.total.toLocaleString()}. The download includes all of them.</p>
      )}
    </section>
  );
}
