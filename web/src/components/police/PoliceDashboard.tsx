'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { FORCE_CATEGORIES, FORCE_LABELS, rankSeniority } from '@/core/domain/ranks';
import type { ColumnCounts, DashboardColumn, MatrixNode, PoliceDashboard as DashboardData } from '@/modules/deployment/dashboard';

const COLUMNS: DashboardColumn[] = ['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI/HC', 'PC', 'WPC', 'HG', 'AR', 'Others'];
type FolderId = 'zones' | 'ranks' | 'districts';
/** The three dashboard folders shown under the filters; one is open at a time. */
const FOLDERS: { id: FolderId; title: string; hint: string }[] = [
  { id: 'zones', title: 'Deployment of force at different zones', hint: 'Zone, sector and sub-sector strength' },
  { id: 'ranks', title: 'Rank wise police personnel details', hint: 'Officers in each rank' },
  { id: 'districts', title: 'District / unit wise police personnel', hint: 'District / unit × rank abstract' },
];

const number = (value: number) => value.toLocaleString('en-IN');
const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

/** Officers by rank as a grid of cards: rank, count and share of all officers shown. */
function RankBars({ items }: { items: { label: string; count: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section aria-labelledby="rank-cards-title" className="operations-panel min-w-0 p-3 sm:p-4">
      <h3 id="rank-cards-title" className="text-sm font-semibold text-police-navy">Rank wise police personnel details</h3>
      {items.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {items.map(item => (
            <li key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-0.5 text-xl font-semibold leading-tight tabular-nums text-[#0B2545]">{number(item.count)}</p>
              <p className="text-[11px] tabular-nums text-slate-500">{percent(item.count, total)} of officers</p>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-xs text-slate-500">No officers.</p>}
    </section>
  );
}

function Cell({ count, required }: { count: number; required?: number }) {
  if (!count && !required) return <span className="text-slate-300">–</span>;
  const short = required !== undefined && count < required;
  return (
    <span className={`tabular-nums ${short ? 'text-rose-700' : 'text-slate-900'}`} title={required !== undefined ? `${count} allotted of ${required} required` : `${count} allotted`}>
      {number(count)}
      {required !== undefined && <span className="text-slate-400">/{number(required)}</span>}
      {short && <span className="sr-only"> (short)</span>}
    </span>
  );
}

export function PoliceDashboard() {
  const [force, setForce] = useState('');
  const [zone, setZone] = useState('');
  const [district, setDistrict] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<FolderId>('zones');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (force) params.set('force', force);
    if (zone) params.set('zone', zone);
    if (district) params.set('district', district);
    fetch(`/api/police-force/dashboard?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load the dashboard.');
        setData(body);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [force, zone, district, reload]);

  const columns = useMemo(() => COLUMNS.filter(column =>
    !['AR', 'Others'].includes(column) || data?.matrix.some(zoneNode => (zoneNode.counts[column] ?? 0) > 0)
    || data?.districtRanks.some(row => (row.counts[column] ?? 0) > 0)), [data]);

  const rankItems = useMemo(() => (data?.byRank ?? []).slice()
    .sort((a, b) => rankSeniority(a.label === 'ASI/HC' ? 'ASI' : a.label) - rankSeniority(b.label === 'ASI/HC' ? 'ASI' : b.label)), [data]);

  const toggle = (key: string) => setOpen(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const matrixRows: { node: MatrixNode; depth: number }[] = [];
  const walk = (nodes: MatrixNode[], depth: number) => nodes.forEach(node => {
    matrixRows.push({ node, depth });
    if (open.has(node.key)) walk(node.children, depth + 1);
  });
  walk(data?.matrix ?? [], 0);

  const columnTotals = (rows: { counts: ColumnCounts }[]) => Object.fromEntries(columns.map(column =>
    [column, rows.reduce((sum, row) => sum + (row.counts[column] ?? 0), 0)])) as ColumnCounts;
  const districtTotals = columnTotals(data?.districtRanks ?? []);
  const t = data?.totals;
  const tiles = t ? [
    { label: 'Total officers', value: t.officers, note: '' },
    { label: 'Allotted to zones', value: t.allotted, note: percent(t.allotted, t.officers) },
    { label: 'On a duty point', value: t.onPoint, note: percent(t.onPoint, t.officers) },
    { label: 'Not allotted', value: t.notAllotted, note: percent(t.notAllotted, t.officers) },
    { label: 'ID cards printed', value: t.printed, note: percent(t.printed, t.officers) },
  ] : [];

  return (
    <section aria-label="Police Force dashboard" className="operations-enter space-y-4">
      <div className="operations-panel flex flex-wrap items-end gap-2.5 p-3 sm:p-4">
        <h2 className="mr-auto self-center text-base font-semibold text-police-navy">Police Force dashboard</h2>
        <div className="w-40 space-y-1">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Force</span>
          <CustomSelect ariaLabel="Force" value={force} onChange={setForce}
            options={[{ value: '', label: 'All forces' }, ...FORCE_CATEGORIES.map(item => ({ value: item, label: FORCE_LABELS[item] }))]} />
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Zone</span>
          <CustomSelect ariaLabel="Zone" value={zone} onChange={setZone} searchable
            options={[{ value: '', label: 'All zones' }, ...POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number}: ${item.name}` }))]} />
        </div>
        <div className="w-full space-y-1 sm:w-56">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">District / unit</span>
          <CustomSelect ariaLabel="District / unit" value={district} onChange={setDistrict} searchable
            options={[{ value: '', label: 'All districts / units' }, ...(data?.districtOptions ?? (district ? [district] : [])).map(item => ({ value: item, label: item }))]} />
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Refresh dashboard"
          className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <a href={`/api/police-force/scheme?${new URLSearchParams({ ...(force ? { force } : {}), ...(zone ? { zone } : {}), ...(district ? { district } : {}) })}`}
          target="_blank" rel="noopener" title="Zone-wise bandobast scheme with the officers allotted now"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-police-crimson px-4 text-sm font-semibold text-white shadow-sm hover:bg-police-crimsonLight">
          <FileText aria-hidden="true" className="size-4" /> Print scheme (PDF)
        </a>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}

      <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5 ${loading ? 'opacity-60' : ''}`}>
        {tiles.map(tile => (
          <div key={tile.label} className="operations-panel p-3">
            <p className="text-xs font-medium text-slate-600">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{number(tile.value)}</p>
            {tile.note && <p className="text-xs tabular-nums text-slate-500">{tile.note} of all</p>}
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Dashboard folders" className="grid gap-2.5 sm:grid-cols-3">
        {FOLDERS.map(({ id, title, hint }) => {
          const selected = folder === id;
          const Icon = selected ? FolderOpen : Folder;
          const [value, caption] = id === 'zones' ? [data?.totals.allotted, `allotted across ${data?.matrix.length ?? 0} zones`]
            : id === 'ranks' ? [data?.totals.officers, `officers in ${rankItems.length} ranks`]
              : [data?.districtRanks.length, 'districts / units'];
          return (
            <button key={id} type="button" role="tab" id={`folder-${id}`} aria-selected={selected} aria-controls={`folder-panel-${id}`}
              onClick={() => setFolder(id)}
              className={`flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-navy/30 ${selected
                ? 'border-police-navy bg-sky-50/60 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? 'bg-police-navy text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold leading-snug ${selected ? 'text-police-navy' : 'text-slate-800'}`}>{title}</span>
                <span className="block truncate text-xs text-slate-500">{data ? caption : hint}</span>
              </span>
              <span className={`shrink-0 text-xl font-semibold tabular-nums ${selected ? 'text-police-navy' : 'text-slate-400'}`}>
                {value === undefined ? '–' : number(value)}
              </span>
            </button>
          );
        })}
      </div>

      {folder === 'zones' && <div role="tabpanel" id="folder-panel-zones" aria-labelledby="folder-zones" className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-police-navy">Deployment of force at different zones</h3>
          <p className="text-xs text-slate-500">Allotted / required by the scheme. <span className="text-rose-700">Red</span> = short of the requirement. Open a zone to see its sectors.</p>
        </div>
        <div role="region" aria-label="Rank-wise strength table" tabIndex={0} className="mt-2 max-h-[34rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-2 py-2 font-semibold">Zone / sector / sub-sector</th>
                {columns.map(column => <th key={column} scope="col" className="px-2 py-2 text-right font-semibold">{column}</th>)}
                <th scope="col" className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrixRows.map(({ node, depth }) => {
                const expandable = node.children.length > 0;
                const requiredTotal = node.required ? Object.values(node.required).reduce((sum, value) => sum + (value ?? 0), 0) : undefined;
                return (
                  <tr key={node.key} className={depth === 0 ? 'bg-white font-medium' : depth === 1 ? 'bg-slate-50/50' : 'bg-slate-50'}>
                    <th scope="row" className="px-2 py-1.5 font-normal" style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}>
                      {expandable ? (
                        <button type="button" onClick={() => toggle(node.key)} aria-expanded={open.has(node.key)}
                          className="inline-flex items-center gap-1 text-left font-semibold text-police-navy hover:underline">
                          {open.has(node.key) ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
                          {node.label}
                        </button>
                      ) : <span className={depth === 0 ? 'font-semibold text-police-navy' : 'text-slate-700'}>{node.label}</span>}
                    </th>
                    {columns.map(column => {
                      const required = node.required?.[column as keyof typeof node.required];
                      return <td key={column} className="px-2 py-1.5 text-right"><Cell count={node.counts[column] ?? 0} required={required} /></td>;
                    })}
                    <td className="px-2 py-1.5 text-right font-semibold"><Cell count={node.total} required={requiredTotal} /></td>
                  </tr>
                );
              })}
              {!matrixRows.length && !loading && <tr><td colSpan={columns.length + 2} className="p-5 text-center text-slate-500">No zones.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      {folder === 'ranks' && <div role="tabpanel" id="folder-panel-ranks" aria-labelledby="folder-ranks" className={loading ? 'opacity-60' : ''}>
        <RankBars items={rankItems} />
      </div>}

      {folder === 'districts' && <div role="tabpanel" id="folder-panel-districts" aria-labelledby="folder-districts" className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <h3 className="text-sm font-semibold text-police-navy">District / unit wise police personnel</h3>
        <div role="region" aria-label="District by rank table" tabIndex={0} className="mt-2 max-h-[30rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-2 py-2 font-semibold">S. No.</th>
                <th scope="col" className="px-2 py-2 font-semibold">District / unit</th>
                {columns.map(column => <th key={column} scope="col" className="px-2 py-2 text-right font-semibold">{column}</th>)}
                <th scope="col" className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.districtRanks ?? []).map((row, index) => (
                <tr key={row.district} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{index + 1}</td>
                  <th scope="row" className="px-2 py-1.5 font-medium text-slate-800">{row.district}</th>
                  {columns.map(column => <td key={column} className="px-2 py-1.5 text-right"><Cell count={row.counts[column] ?? 0} /></td>)}
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{number(row.total)}</td>
                </tr>
              ))}
            </tbody>
            {data && data.districtRanks.length > 0 && (
              <tfoot className="sticky bottom-0 border-t border-slate-300 bg-slate-100 font-semibold">
                <tr>
                  <td />
                  <th scope="row" className="px-2 py-1.5">Total</th>
                  {columns.map(column => <td key={column} className="px-2 py-1.5 text-right tabular-nums">{number(districtTotals[column] ?? 0)}</td>)}
                  <td className="px-2 py-1.5 text-right tabular-nums">{number(data.totals.officers)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>}
    </section>
  );
}
