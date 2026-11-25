'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { useDialog } from '../common/useDialog';
import { dutyPointsFor, type PoliceSectorItem } from '@/core/domain/police-zones';
import { requirementTotal, schemeRequirement } from '@/core/domain/scheme-requirements';

export type DutyNode = { sector: string; subSector?: string | null; point?: string | null };

/** Allotted-vs-required bar: blue while filling, green when complete. `onDark` for the navy sector bar. */
function Progress({ allotted, required, onDark = false }: { allotted: number; required?: number; onDark?: boolean }) {
  const percent = required ? Math.min(100, Math.round((allotted / required) * 100)) : allotted > 0 ? 100 : 0;
  const done = required ? allotted >= required : false;
  const tone = required ? (done ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-teal-500';
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span aria-hidden="true" className={`hidden h-2 w-24 overflow-hidden rounded-full sm:block ${onDark ? 'bg-white/25' : 'bg-slate-300'}`}>
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(percent, allotted > 0 ? 4 : 0)}%` }} />
      </span>
      <span className={`min-w-[4.5rem] rounded-full px-2.5 py-0.5 text-center text-xs font-bold tabular-nums ${done
        ? 'bg-emerald-600 text-white' : allotted > 0 ? 'bg-blue-600 text-white' : onDark ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-700'}`}>
        {allotted}{required ? ` / ${required}` : ''}
      </span>
    </span>
  );
}

/**
 * Popup map of a zone's sectors (navy), sub-sectors (indigo) and duty points (teal),
 * with officers allotted. Choosing an entry filters the officer list.
 */
export function DutyPointsMapDialog({
  zoneName, zoneNumber, sectors, counts, node, onChoose, onClose,
}: {
  zoneName: string;
  zoneNumber?: number;
  sectors: PoliceSectorItem[];
  /** Keys: S|sector, U|sector|subSector, P|pointCode → officers allotted. */
  counts: Map<string, number>;
  node: DutyNode | null;
  onChoose: (node: DutyNode | null) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialog(true, onClose);
  const [search, setSearch] = useState('');
  const [onlyStaffed, setOnlyStaffed] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const query = search.trim().toLowerCase();
  const choose = (next: DutyNode | null) => { onChoose(next); onClose(); };
  const toggleSector = (number: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(number)) next.delete(number); else next.add(number);
    return next;
  });

  const totalAllotted = sectors.reduce((sum, sector) => sum + (counts.get(`S|${sector.number}`) ?? 0), 0);

  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="duty-map-title" tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h3 id="duty-map-title" className="truncate text-lg font-semibold text-police-navy">
              {zoneNumber ? `Zone ${zoneNumber} · ` : ''}{zoneName}
            </h3>
            <p className="text-xs font-medium text-slate-600">{totalAllotted} officers allotted · choose a sector, sub-sector or point to filter the list</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <label className="relative block min-w-52 flex-1">
            <span className="sr-only">Search points and sub-sectors</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Search points or sub-sectors" className="operations-input pl-9 pr-3" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={onlyStaffed} onChange={event => setOnlyStaffed(event.target.checked)} className="size-4 accent-police-crimson" />
            Only points with officers
          </label>
          <span className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Legend">
            <span className="rounded-full bg-police-navy px-2.5 py-1 font-semibold text-white">Sector</span>
            <span className="rounded-full bg-indigo-600 px-2.5 py-1 font-semibold text-white">Sub-sector</span>
            <span className="rounded-full bg-teal-600 px-2.5 py-1 font-semibold text-white">Point with officers</span>
          </span>
        </div>

        {node && (
          <div className="mx-5 mb-2 flex items-center justify-between gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
            <span>Filtering the list to the highlighted entry.</span>
            <button type="button" onClick={() => choose(null)} className="font-semibold text-police-crimson hover:underline">
              Show whole {sectors.length > 1 ? 'zone' : 'sector'}
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
          {sectors.map(sector => {
            const sectorCount = counts.get(`S|${sector.number}`) ?? 0;
            const sectorReq = schemeRequirement(zoneName, sector.number);
            const sectorRequired = sectorReq ? requirementTotal(sectorReq) : sector.allocation;
            const sectorActive = node?.sector === sector.number && !node.subSector && !node.point;
            const isOpen = !collapsed.has(sector.number) || Boolean(query);

            const groups: (string | null)[] = sector.subSectors?.length ? [...sector.subSectors, null] : [null];
            const blocks = groups.map(sub => {
              const points = dutyPointsFor(zoneName, sector.number, sector.subSectors?.length ? sub : undefined)
                .filter(point => !onlyStaffed || (counts.get(`P|${point.code}`) ?? 0) > 0)
                .filter(point => !query || point.name.toLowerCase().includes(query) || (sub ?? '').toLowerCase().includes(query));
              if (sub === null && sector.subSectors?.length && !points.length) return null;
              if ((query || onlyStaffed) && !points.length && !(sub && query && sub.toLowerCase().includes(query))) return null;
              return { sub, points };
            }).filter(Boolean) as { sub: string | null; points: ReturnType<typeof dutyPointsFor> }[];
            if ((query || onlyStaffed) && !blocks.length) return null;

            return (
              <section key={sector.number} aria-label={`${sector.number}: ${sector.name}`} className="overflow-hidden rounded-3xl border border-slate-300 shadow-sm">
                <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-3 text-white ${sectorActive ? 'bg-police-crimson' : 'bg-police-navy'}`}>
                  <button type="button" onClick={() => toggleSector(sector.number)} aria-expanded={isOpen}
                    aria-label={isOpen ? `Collapse ${sector.number}` : `Expand ${sector.number}`}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white">
                    <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  </button>
                  <button type="button" onClick={() => choose({ sector: sector.number })} aria-current={sectorActive ? 'true' : undefined}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                    <span className="min-w-0 text-sm font-semibold hover:underline">
                      <span className="text-white/70">{sector.number} · </span>{sector.name}
                    </span>
                    <Progress allotted={sectorCount} required={sectorRequired} onDark />
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-3 bg-slate-50/60 px-4 py-4">
                    {blocks.map(({ sub, points }) => {
                      const subCount = sub ? counts.get(`U|${sector.number}|${sub}`) ?? 0 : 0;
                      const subReq = sub ? schemeRequirement(zoneName, sector.number, sub) : undefined;
                      const subActive = Boolean(sub) && node?.sector === sector.number && node.subSector === sub && !node.point;
                      return (
                        <div key={sub ?? 'sector-points'}>
                          {sub && (
                            <button type="button" onClick={() => choose({ sector: sector.number, subSector: sub })}
                              aria-current={subActive ? 'true' : undefined}
                              className={`mb-1.5 flex w-full items-center justify-between gap-3 rounded-full border-2 py-1.5 pl-3 pr-1.5 text-left ${subActive
                                ? 'border-police-crimson bg-rose-100' : 'border-indigo-300 bg-indigo-100 hover:bg-indigo-200/70'}`}>
                              <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-indigo-950">
                                <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${subActive ? 'bg-police-crimson' : 'bg-indigo-500'}`} />
                                {sub}
                              </span>
                              <Progress allotted={subCount} required={subReq ? requirementTotal(subReq) : undefined} />
                            </button>
                          )}
                          {points.length > 0 ? (
                            <ul className={`grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 ${sub ? 'pl-4' : 'pl-1'}`}>
                              {points.map(point => {
                                const count = counts.get(`P|${point.code}`) ?? 0;
                                const active = node?.point === point.code;
                                return (
                                  <li key={point.code}>
                                    <button type="button" onClick={() => choose({ sector: sector.number, subSector: point.subSector, point: point.code })}
                                      aria-current={active ? 'true' : undefined}
                                      className={`flex w-full items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5 text-left text-[13px] ${active
                                        ? 'border-police-crimson bg-rose-100 font-semibold text-police-crimson'
                                        : count > 0 ? 'border-teal-300 bg-teal-100 font-semibold text-teal-950 hover:bg-teal-200/70'
                                        : 'border-transparent text-slate-800 hover:border-slate-200 hover:bg-white'}`}>
                                      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${count > 0 ? 'bg-teal-600' : 'bg-slate-400'}`} />
                                      <span className="min-w-0 flex-1 truncate" title={point.name}>{point.name}</span>
                                      {count > 0 && <span className="grid min-w-6 shrink-0 place-items-center rounded-full bg-teal-700 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">{count}</span>}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : sub ? (
                            <p className="pl-4 text-xs text-slate-600">No points listed.</p>
                          ) : null}
                        </div>
                      );
                    })}
                    {!blocks.length && <p className="text-xs text-slate-600">No duty points listed for this sector.</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
