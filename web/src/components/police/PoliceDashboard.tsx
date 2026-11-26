'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { FORCE_CATEGORIES, FORCE_LABELS, rankSeniority } from '@/core/domain/ranks';
import type { ColumnCounts, DashboardColumn, MatrixNode, PoliceDashboard as DashboardData } from '@/modules/deployment/dashboard';

const COLUMNS: DashboardColumn[] = ['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI/HC', 'PC', 'WPC', 'HG', 'AR', 'Others'];
// Categorical order validated for adjacent-pair separation (no amber / orange); "Others" is neutral.
const SERIES = ['#2a78d6', '#1baf7a', '#6250d6', '#e87ba4', '#008300', '#e34948'];
const OTHER_COLOR = '#94a3b8';
const FORCE_COLORS: Record<string, string> = { CIVIL: '#2a78d6', AR: '#1baf7a', STF: '#6250d6', OTHERS: OTHER_COLOR };
const GENDER_COLORS: Record<string, string> = { MALE: '#2a78d6', FEMALE: '#e87ba4', OTHER: OTHER_COLOR };
const GENDER_LABELS: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

interface Slice { label: string; count: number; color: string }

const number = (value: number) => value.toLocaleString('en-IN');
const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

/** Donut with a 2px surface gap between slices; hovering a slice or legend row shows it in the centre. */
function Donut({ title, slices }: { title: string; slices: Slice[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const size = 168;
  const radius = 70;
  const inner = 46;
  const centre = size / 2;
  let angle = -Math.PI / 2;
  const arcs = slices.map((slice, index) => {
    const sweep = total ? (slice.count / total) * Math.PI * 2 : 0;
    const start = angle;
    angle += sweep;
    const end = angle;
    const large = sweep > Math.PI ? 1 : 0;
    const point = (r: number, a: number) => `${centre + r * Math.cos(a)} ${centre + r * Math.sin(a)}`;
    const d = sweep >= Math.PI * 2 - 1e-6
      ? `M ${point(radius, 0)} A ${radius} ${radius} 0 1 1 ${point(radius, Math.PI)} A ${radius} ${radius} 0 1 1 ${point(radius, 0)} Z
         M ${point(inner, 0)} A ${inner} ${inner} 0 1 0 ${point(inner, Math.PI)} A ${inner} ${inner} 0 1 0 ${point(inner, 0)} Z`
      : `M ${point(radius, start)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
    return { d, index, slice };
  });
  const shown = active === null ? null : slices[active];

  return (
    <figure className="operations-panel min-w-0 p-3 sm:p-4">
      <figcaption className="text-sm font-semibold text-police-navy">{title}</figcaption>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${title}: ${slices.map(s => `${s.label} ${s.count}`).join(', ')}`} className="shrink-0">
          {total === 0 && <circle cx={centre} cy={centre} r={(radius + inner) / 2} fill="none" stroke="#e2e8f0" strokeWidth={radius - inner} />}
          {arcs.map(({ d, index, slice }) => slice.count > 0 && (
            <path key={slice.label} d={d} fill={slice.color} fillRule="evenodd" stroke="#ffffff" strokeWidth={2}
              opacity={active === null || active === index ? 1 : 0.35}
              onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} className="cursor-default transition-opacity" />
          ))}
          <text x={centre} y={centre - 4} textAnchor="middle" className="fill-slate-900 text-[17px] font-semibold tabular-nums">
            {number(shown ? shown.count : total)}
          </text>
          <text x={centre} y={centre + 13} textAnchor="middle" className="fill-slate-500 text-[10px]">
            {shown ? `${shown.label.length > 16 ? `${shown.label.slice(0, 15)}…` : shown.label} · ${percent(shown.count, total)}` : 'officers'}
          </text>
        </svg>
        <ul className="min-w-[10rem] flex-1 space-y-1 text-xs">
          {slices.map((slice, index) => (
            <li key={slice.label} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 ${active === index ? 'bg-slate-100' : ''}`}>
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="min-w-0 flex-1 truncate text-slate-700" title={slice.label}>{slice.label}</span>
              <span className="tabular-nums font-semibold text-slate-900">{number(slice.count)}</span>
              <span className="w-12 text-right tabular-nums text-slate-500">{percent(slice.count, total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function RankBars({ items }: { items: { label: string; count: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...items.map(item => item.count));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <figure className="operations-panel min-w-0 p-3 sm:p-4">
      <figcaption className="text-sm font-semibold text-police-navy">Officers by rank</figcaption>
      <ul className="mt-3 space-y-1.5 text-xs">
        {items.map(item => (
          <li key={item.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2"
            onMouseEnter={() => setActive(item.label)} onMouseLeave={() => setActive(null)}>
            <span className="truncate font-medium text-slate-700">{item.label}</span>
            <span className="h-3 rounded-full bg-slate-100">
              <span className="block h-3 rounded-full" style={{ width: `${Math.max(2, (item.count / max) * 100)}%`, background: active && active !== item.label ? '#9ec3ee' : '#2a78d6' }} />
            </span>
            <span className="text-right tabular-nums text-slate-900">
              {number(item.count)}{active === item.label && <span className="text-slate-500"> · {percent(item.count, total)}</span>}
            </span>
          </li>
        ))}
        {!items.length && <li className="text-slate-500">No officers.</li>}
      </ul>
    </figure>
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (force) params.set('force', force);
    if (zone) params.set('zone', zone);
    fetch(`/api/police-force/dashboard?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load the dashboard.');
        setData(body);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [force, zone, reload]);

  const columns = useMemo(() => COLUMNS.filter(column =>
    !['AR', 'Others'].includes(column) || data?.matrix.some(zoneNode => (zoneNode.counts[column] ?? 0) > 0)
    || data?.districtRanks.some(row => (row.counts[column] ?? 0) > 0)), [data]);

  const districtSlices = useMemo<Slice[]>(() => {
    const list = data?.byDistrict ?? [];
    const top = list.slice(0, SERIES.length).map((item, index) => ({ ...item, color: SERIES[index] }));
    const rest = list.slice(SERIES.length).reduce((sum, item) => sum + item.count, 0);
    return rest ? [...top, { label: `Others (${list.length - SERIES.length} districts)`, count: rest, color: OTHER_COLOR }] : top;
  }, [data]);
  const forceSlices = useMemo<Slice[]>(() => FORCE_CATEGORIES
    .map(item => ({ label: FORCE_LABELS[item], count: data?.byForce.find(row => row.label === item)?.count ?? 0, color: FORCE_COLORS[item] }))
    .filter(item => item.count > 0), [data]);
  const genderSlices = useMemo<Slice[]>(() => (data?.byGender ?? [])
    .map(item => ({ label: GENDER_LABELS[item.label] ?? item.label, count: item.count, color: GENDER_COLORS[item.label] ?? OTHER_COLOR })), [data]);
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
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Refresh dashboard"
          className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
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

      <div className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-police-navy">Rank-wise strength by zone, sector and sub-sector</h3>
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
      </div>

      <div className={`grid gap-4 lg:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
        <Donut title="Officers by district / unit" slices={districtSlices} />
        <RankBars items={rankItems} />
        <Donut title="Officers by force" slices={forceSlices} />
        <Donut title="Officers by gender" slices={genderSlices} />
      </div>

      <div className={`operations-panel min-w-0 p-3 sm:p-4 ${loading ? 'opacity-60' : ''}`}>
        <h3 className="text-sm font-semibold text-police-navy">Abstract: district × rank</h3>
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
      </div>
    </section>
  );
}
