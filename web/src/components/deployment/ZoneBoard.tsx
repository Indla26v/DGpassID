'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, MapPin, Phone, RotateCw, Search } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { POLICE_BANDOBUSHT_ZONES, type PoliceSectorItem } from '@/core/domain/police-zones';
import { displayRank, rankGroupOf, rankSeniority } from '@/core/domain/ranks';
import { requirementTotal, SCHEME_RANK_COLUMNS, schemeColumnOf, schemeRequirement } from '@/core/domain/scheme-requirements';
import type { DeploymentOfficer } from '@/modules/deployment/deployment.repository';

/** Allotted / required as a bar plus a filled pill (blue while filling, green when complete). */
function Strength({ allotted, required, onDark = false }: { allotted: number; required?: number; onDark?: boolean }) {
  const done = required ? allotted >= required : false;
  const percent = required ? Math.min(100, Math.round((allotted / required) * 100)) : 0;
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      {required ? (
        <span aria-hidden="true" className={`hidden h-2 w-24 overflow-hidden rounded-full sm:block ${onDark ? 'bg-white/25' : 'bg-slate-300'}`}>
          <span className={`block h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${Math.max(percent, allotted ? 4 : 0)}%` }} />
        </span>
      ) : null}
      <span className={`min-w-[4.5rem] rounded-full px-2.5 py-0.5 text-center text-xs font-bold tabular-nums ${done
        ? 'bg-emerald-600 text-white' : allotted ? 'bg-blue-600 text-white' : onDark ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-700'}`}>
        {allotted}{required ? ` / ${required}` : ''}
      </span>
    </span>
  );
}

const rankIndex = rankSeniority;
type SortKey = 'rank-senior' | 'rank-junior' | 'no-point' | 'name';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'rank-senior', label: 'Rank: senior first' },
  { value: 'rank-junior', label: 'Rank: junior first' },
  { value: 'no-point', label: 'No point first' },
  { value: 'name', label: 'Name A–Z' },
];
const byName = (a: DeploymentOfficer, b: DeploymentOfficer) => a.full_name.localeCompare(b.full_name);
function sortOfficers(list: DeploymentOfficer[], key: SortKey) {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (key === 'name') return byName(a, b);
    if (key === 'no-point') {
      const pa = a.police_point_code ? 1 : 0;
      const pb = b.police_point_code ? 1 : 0;
      return pa - pb || rankIndex(a.rank) - rankIndex(b.rank) || byName(a, b);
    }
    const diff = rankIndex(a.rank) - rankIndex(b.rank);
    return (key === 'rank-junior' ? -diff : diff) || byName(a, b);
  });
  return sorted;
}

const subSectorOf = (sector: PoliceSectorItem, officer: DeploymentOfficer) =>
  sector.subSectors?.includes(officer.police_sector_name ?? '') ? officer.police_sector_name : null;

/** Read-only board of a zone: sectors, sub-sectors and the officers allotted to each, against the scheme. */
export function ZoneBoard() {
  const { user } = useAuth();
  const isSp = user.role === 'ADMIN';
  const scope = useMemo(() => user.policePrintScope ?? [], [user.policePrintScope]);
  const zones = POLICE_BANDOBUSHT_ZONES.filter(zone => isSp || scope.some(item => item.zone === zone.name));
  const [zoneName, setZoneName] = useState(zones[0]?.name ?? '');
  const zone = zones.find(item => item.name === zoneName);
  const wholeZone = isSp || scope.some(item => item.zone === zoneName && item.sector === null);
  const sectors = (zone?.sectors ?? []).filter(sector => wholeZone || scope.some(item => item.zone === zoneName && item.sector === sector.number));

  const [officers, setOfficers] = useState<DeploymentOfficer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('rank-senior');

  const load = useCallback(async () => {
    if (!zoneName) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/deployment/officers?${new URLSearchParams({ zone: zoneName })}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the zone board.');
      setOfficers(data.officers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the zone board.');
      setOfficers([]);
    } finally {
      setLoading(false);
    }
  }, [zoneName]);
  useEffect(() => { void load(); }, [load]);

  const text = query.trim().toLowerCase();
  const matches = (officer: DeploymentOfficer) => !text || [officer.full_name, officer.police_id_number, officer.mobile_number,
    officer.district, officer.police_point_name, officer.rank].some(value => (value ?? '').toLowerCase().includes(text));

  const totals = useMemo(() => {
    const required = sectors.reduce((sum, sector) => {
      const req = zone && schemeRequirement(zone.name, sector.number);
      return sum + (req ? requirementTotal(req) : 0);
    }, 0);
    return { allotted: officers.length, required, onPoint: officers.filter(item => item.police_point_code).length };
  }, [officers, sectors, zone]);

  if (!zones.length) {
    return <div className="operations-panel p-6 text-sm text-slate-600">No zone or sector is assigned to your account yet.</div>;
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="operations-panel flex flex-wrap items-center gap-3 p-3 sm:p-4">
        {zones.length > 1 && (
          <div role="group" aria-label="Zone" className="flex flex-wrap gap-1.5">
            {zones.map(item => (
              <button key={item.id} type="button" aria-pressed={item.name === zoneName} onClick={() => setZoneName(item.name)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${item.name === zoneName ? 'bg-police-navy text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                Zone {item.number}: {item.name}
              </button>
            ))}
          </div>
        )}
        <dl className="flex flex-wrap gap-2 text-xs">
          {[
            ['Allotted', totals.allotted],
            ['Scheme strength', totals.required || '—'],
            ['On a duty point', totals.onPoint],
            ['Not on a point', totals.allotted - totals.onPoint],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-100 px-3.5 py-2">
              <dt className="text-slate-600">{label}</dt>
              <dd className="text-lg font-bold tabular-nums text-police-navy">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="ml-auto flex min-w-[16rem] flex-1 flex-wrap items-center gap-2 sm:flex-none">
          <label className="relative block flex-1">
            <span className="sr-only">Search officers</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Search officer, rank or point" className="operations-input pl-9 pr-3" />
          </label>
          <div className="w-44 shrink-0">
            <CustomSelect ariaLabel="Sort officers" value={sortKey} onChange={value => setSortKey(value as SortKey)} options={SORTS} />
          </div>
          <PillButton type="button" size="sm" variant="outline" disabled={loading} aria-label="Refresh"
            icon={<RotateCw aria-hidden="true" className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />} onClick={() => void load()}>
            Refresh
          </PillButton>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}

      {sectors.map(sector => {
        const sectorOfficers = officers.filter(item => item.police_sector_number === sector.number);
        const requirement = zone ? schemeRequirement(zone.name, sector.number) : undefined;
        const required = requirement ? requirementTotal(requirement) : sector.allocation;
        const byColumn: Record<string, number> = {};
        const other: Record<string, number> = {};
        for (const officer of sectorOfficers) {
          const column = schemeColumnOf(officer.rank);
          if (column) byColumn[column] = (byColumn[column] ?? 0) + 1;
          else { const group = rankGroupOf(officer.rank) || 'Unknown'; other[group] = (other[group] ?? 0) + 1; }
        }
        const groups: (string | null)[] = [...(sector.subSectors ?? []), null];
        const open = !collapsed.has(sector.number) || Boolean(text);

        return (
          <section key={sector.number} aria-label={`${sector.number}: ${sector.name}`} className="overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center gap-2 bg-police-navy px-4 py-3 text-white">
              <button type="button" aria-expanded={open} aria-label={open ? `Collapse ${sector.number}` : `Expand ${sector.number}`}
                onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(sector.number)) next.delete(sector.number); else next.add(sector.number); return next; })}
                className="grid size-7 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white">
                <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
              <h3 className="min-w-0 flex-1 text-sm font-semibold"><span className="text-white/70">{sector.number} · </span>{sector.name}</h3>
              <Strength allotted={sectorOfficers.length} required={required} onDark />
            </div>

            {open && (
              <div className="space-y-3 p-4">
                <ul aria-label="Allotted of required, by rank" className="flex flex-wrap gap-1.5 text-xs">
                  {SCHEME_RANK_COLUMNS.filter(rank => (requirement?.[rank] ?? 0) > 0 || (byColumn[rank] ?? 0) > 0).map(rank => {
                    const need = requirement?.[rank] ?? 0;
                    const have = byColumn[rank] ?? 0;
                    return (
                      <li key={rank} className={`rounded-full px-3 py-1 font-semibold tabular-nums ${need && have >= need
                        ? 'bg-emerald-600 text-white' : have ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                        {rank} {have}{need ? `/${need}` : ''}
                      </li>
                    );
                  })}
                  {Object.entries(other).map(([rank, have]) => (
                    <li key={rank} className="rounded-full bg-slate-700 px-3 py-1 font-semibold tabular-nums text-white">{rank} {have}</li>
                  ))}
                  {!requirement && !sectorOfficers.length && <li className="text-slate-500">No officers allotted yet.</li>}
                </ul>

                {groups.map(sub => {
                  const list = sortOfficers(sectorOfficers.filter(officer => subSectorOf(sector, officer) === sub).filter(matches), sortKey);
                  const subTotal = sectorOfficers.filter(officer => subSectorOf(sector, officer) === sub).length;
                  if (sub === null && !subTotal) return null;
                  if (text && !list.length) return null;
                  const subReq = sub && zone ? schemeRequirement(zone.name, sector.number, sub) : undefined;
                  return (
                    <div key={sub ?? 'sector-level'} className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className={`flex items-center justify-between gap-3 px-3.5 py-2 ${sub ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                        <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-slate-900">
                          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${sub ? 'bg-indigo-500' : 'bg-slate-500'}`} />
                          {sub ?? 'Sector level (no sub-sector yet)'}
                        </span>
                        <Strength allotted={subTotal} required={subReq ? requirementTotal(subReq) : undefined} />
                      </div>
                      {list.length > 0 ? (
                        <table className="w-full text-left text-xs">
                          <thead className="sr-only"><tr><th>Officer</th><th>Rank</th><th>Mobile</th><th>District</th><th>Point</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {list.map(officer => (
                              <tr key={officer.id} className="hover:bg-slate-50">
                                <td className="px-3.5 py-1.5">
                                  <span className="font-semibold text-slate-900">{officer.full_name}</span>
                                  <span className="ml-2 text-slate-500">{officer.police_id_number}</span>
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-police-crimson">{displayRank(officer.rank)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5">
                                  {officer.mobile_number ? (
                                    <a href={`tel:${officer.mobile_number}`} title={`Call ${officer.full_name}`}
                                      className="inline-flex items-center gap-1 font-medium tabular-nums text-police-navy hover:text-police-crimson hover:underline">
                                      <Phone aria-hidden="true" className="size-3" />{officer.mobile_number}
                                    </a>
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-2 py-1.5 text-slate-600">{officer.district}</td>
                                <td className="px-3.5 py-1.5 text-right">
                                  {officer.police_point_name ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 font-semibold text-teal-900">
                                      <MapPin aria-hidden="true" className="size-3" />{officer.police_point_name}
                                    </span>
                                  ) : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">No point yet</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="px-3.5 py-2 text-xs text-slate-500">No officers allotted here yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      {loading && !officers.length && <p className="text-sm text-slate-500">Loading the zone board…</p>}
    </div>
  );
}
