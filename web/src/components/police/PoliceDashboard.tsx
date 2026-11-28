'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { exportDistrictPersonnel, exportRankPersonnel, exportZoneDeployment } from '@/lib/dashboard-export';
import { CustomSelect } from '../common/CustomSelect';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { FORCE_CATEGORIES, FORCE_LABELS, rankSeniority } from '@/core/domain/ranks';
import type { ColumnCounts, DashboardColumn, MatrixNode, PoliceDashboard as DashboardData } from '@/modules/deployment/dashboard';

const COLUMNS: DashboardColumn[] = ['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI/HC', 'PC', 'WPC', 'HG', 'RI', 'RSI', 'ARSI', 'ARHC', 'ARPC', 'Others'];
/** AR ranks and Others are shown only when some officer has them. */
const OPTIONAL_COLUMNS: DashboardColumn[] = ['RI', 'RSI', 'ARSI', 'ARHC', 'ARPC', 'Others'];
type FolderId = 'zones' | 'ranks' | 'districts';
/** The three dashboard folders shown under the filters; one is open at a time. */
const FOLDERS: { id: FolderId; title: string; hint: string }[] = [
  { id: 'zones', title: 'ZONE WISE DEPLOYMENT', hint: 'Zone, sector and sub-sector strength' },
  { id: 'ranks', title: 'RANK WISE PERSONNEL', hint: 'Officers in each rank' },
  { id: 'districts', title: 'DISTRICT / UNIT WISE PERSONNEL', hint: 'District / unit × rank abstract' },
];

/** Solid colour per folder card; the open one is lifted with a ring in the same colour. */
const FOLDER_COLORS: Record<FolderId, { card: string; ring: string }> = {
  zones: { card: 'bg-[#0B2545] hover:bg-[#13315C]', ring: 'ring-[#0B2545]' },
  ranks: { card: 'bg-teal-700 hover:bg-teal-800', ring: 'ring-teal-700' },
  districts: { card: 'bg-[#8B1A1A] hover:bg-[#A32020]', ring: 'ring-[#8B1A1A]' },
};

const number = (value: number) => value.toLocaleString('en-IN');
const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

/** Excel download for a dashboard folder. */
function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#0B2545] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#13315C] disabled:opacity-50">
      <FileSpreadsheet aria-hidden="true" className="size-4" /> Export Excel
    </button>
  );
}

/** Officers by rank as a grid of cards: rank, count and share of all officers shown. */
function RankBars({ items, onExport }: { items: { label: string; count: number }[]; onExport: () => void }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section aria-labelledby="rank-cards-title" className="operations-panel min-w-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="rank-cards-title" className="text-lg font-bold text-police-navy">Rank wise personnel</h3>
        <ExportButton onClick={onExport} disabled={!items.length} />
      </div>
      {items.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {items.map(item => (
            <li key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
              <p className="mt-1 text-3xl font-bold leading-tight tabular-nums text-[#0B2545]">{number(item.count)}</p>
              <p className="text-xs tabular-nums text-slate-500">{percent(item.count, total)} of officers</p>
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
    !OPTIONAL_COLUMNS.includes(column) || data?.matrix.some(zoneNode => (zoneNode.counts[column] ?? 0) > 0)
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
  const filterLine = [
    `Force: ${force ? FORCE_LABELS[force as keyof typeof FORCE_LABELS] ?? force : 'All forces'}`,
    `Zone: ${zone || 'All zones'}`,
    `District / unit: ${district || 'All districts / units'}`,
  ].join('  ·  ');
  const tiles = t ? [
    // Total officers and Allotted to zones are already on the folder cards above.
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

      <div role="tablist" aria-label="Dashboard folders" className="grid gap-2.5 sm:grid-cols-3">
        {FOLDERS.map(({ id, title, hint }) => {
          const selected = folder === id;
          const [value, caption] = id === 'zones' ? [data?.totals.allotted, `allotted across ${data?.matrix.length ?? 0} zones`]
            : id === 'ranks' ? [data?.totals.officers, `officers in ${rankItems.length} ranks`]
              : [data?.districtRanks.length, 'districts / units'];
          return (
            <button key={id} type="button" role="tab" id={`folder-${id}`} aria-selected={selected} aria-controls={`folder-panel-${id}`}
              onClick={() => setFolder(id)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${FOLDER_COLORS[id].card} ${selected
                ? `shadow-lg ring-2 ring-offset-2 ring-offset-slate-50 ${FOLDER_COLORS[id].ring}` : 'opacity-90 shadow-sm hover:opacity-100'}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug">{title}</span>
                <span className="block truncate text-xs font-medium text-white/80">{data ? caption : hint}</span>
              </span>
              <span className="shrink-0 text-2xl font-extrabold tabular-nums">
                {value === undefined ? '–' : number(value)}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
        {tiles.map(tile => (
          <div key={tile.label} className="operations-panel p-3">
            <p className="text-xs font-medium text-slate-600">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{number(tile.value)}</p>
            {tile.note && <p className="text-xs tabular-nums text-slate-500">{tile.note} of all</p>}
          </div>
        ))}
      </div>


      {folder === 'zones' && <div role="tabpanel" id="folder-panel-zones" aria-labelledby="folder-zones" className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-police-navy">Zone wise deployment</h3>
            <p className="text-sm text-slate-500">Allotted / required by the scheme. <span className="text-rose-700">Red</span> = short of the requirement. Open a zone to see its sectors.</p>
          </div>
          <ExportButton disabled={!data?.matrix.length} onClick={() => data && exportZoneDeployment(data.matrix, columns, filterLine)} />
        </div>
        <div role="region" aria-label="Rank-wise strength table" tabIndex={0} className="mt-2 max-h-[34rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[13px] font-extrabold uppercase tracking-wide text-police-navy [&_th]:whitespace-nowrap [&_th]:font-extrabold">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-3 py-2.5 font-semibold">Zone / sector / sub-sector</th>
                {columns.map(column => <th key={column} scope="col" className="px-3 py-2.5 text-right font-semibold">{column}</th>)}
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrixRows.map(({ node, depth }) => {
                const expandable = node.children.length > 0;
                const requiredTotal = node.required ? Object.values(node.required).reduce((sum, value) => sum + (value ?? 0), 0) : undefined;
                return (
                  <tr key={node.key} className={depth === 0 ? 'bg-white font-medium' : depth === 1 ? 'bg-slate-50/50' : 'bg-slate-50'}>
                    <th scope="row" className="px-3 py-2 font-normal" style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}>
                      {expandable ? (
                        <button type="button" onClick={() => toggle(node.key)} aria-expanded={open.has(node.key)}
                          className={`inline-flex items-center gap-1 text-left hover:underline ${depth === 0
                            ? 'font-extrabold uppercase tracking-wide text-police-crimson' : 'font-semibold text-police-navy'}`}>
                          {open.has(node.key) ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                          {node.label}
                        </button>
                      ) : <span className={depth === 0 ? 'font-extrabold uppercase tracking-wide text-police-crimson' : 'text-slate-700'}>{node.label}</span>}
                    </th>
                    {columns.map(column => {
                      const required = node.required?.[column as keyof typeof node.required];
                      return <td key={column} className="px-3 py-2 text-right"><Cell count={node.counts[column] ?? 0} required={required} /></td>;
                    })}
                    <td className="px-3 py-2 text-right font-semibold"><Cell count={node.total} required={requiredTotal} /></td>
                  </tr>
                );
              })}
              {!matrixRows.length && !loading && <tr><td colSpan={columns.length + 2} className="p-5 text-center text-slate-500">No zones.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      {folder === 'ranks' && <div role="tabpanel" id="folder-panel-ranks" aria-labelledby="folder-ranks" className={loading ? 'opacity-60' : ''}>
        <RankBars items={rankItems} onExport={() => exportRankPersonnel(rankItems, filterLine)} />
      </div>}

      {folder === 'districts' && <div role="tabpanel" id="folder-panel-districts" aria-labelledby="folder-districts" className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-police-navy">District / unit wise personnel</h3>
          <ExportButton disabled={!data?.districtRanks.length}
            onClick={() => data && exportDistrictPersonnel(data.districtRanks, columns, districtTotals, data.totals.officers, filterLine)} />
        </div>
        <div role="region" aria-label="District by rank table" tabIndex={0} className="mt-2 max-h-[30rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-[13px] font-extrabold uppercase tracking-wide text-police-navy [&_th]:whitespace-nowrap [&_th]:font-extrabold">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-3 py-2.5 font-semibold">S. No.</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">District / unit</th>
                {columns.map(column => <th key={column} scope="col" className="px-3 py-2.5 text-right font-semibold">{column}</th>)}
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.districtRanks ?? []).map((row, index) => (
                <tr key={row.district} className="hover:bg-slate-50">
                  <td className="px-3 py-2 tabular-nums text-slate-500">{index + 1}</td>
                  <th scope="row" className="px-3 py-2 font-medium text-slate-800">{row.district}</th>
                  {columns.map(column => <td key={column} className="px-3 py-2 text-right"><Cell count={row.counts[column] ?? 0} /></td>)}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{number(row.total)}</td>
                </tr>
              ))}
            </tbody>
            {data && data.districtRanks.length > 0 && (
              <tfoot className="sticky bottom-0 border-t border-slate-300 bg-slate-100 font-semibold">
                <tr>
                  <td />
                  <th scope="row" className="px-3 py-2">Total</th>
                  {columns.map(column => <td key={column} className="px-3 py-2 text-right tabular-nums">{number(districtTotals[column] ?? 0)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums">{number(data.totals.officers)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>}
    </section>
  );
}
