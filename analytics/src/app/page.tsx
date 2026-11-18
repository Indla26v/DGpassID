'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Building2, Check, ChevronDown, CircleHelp, Clock3, FilePlus2, Fingerprint, Layers3, LayoutDashboard, Loader2, MapPin, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Analytics, Breakdown } from '@/lib/types';

const number = (n: number) => n.toLocaleString('en-IN');
const percent = (n: number, total: number) => total ? Math.round(n / total * 100) : 0;
const labels: Record<string,string> = { DRAFT: 'Draft', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved', READY_TO_PRINT: 'Ready to print', PRINTED: 'Printed', ISSUED: 'Issued', REVOKED: 'Revoked' };
const colors = ['#7661d5', '#48a995', '#e6b45b', '#82a3d8', '#d58da6', '#a4adbd', '#df795e'];

function CreationChart({ trend }: { trend: Analytics['trend'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...trend.map(d => d.total));
  const width = 800, height = 195, left = 32, bottom = 165;
  const x = (i: number) => left + i / Math.max(1, trend.length - 1) * (width - left - 12);
  const y = (n: number) => bottom - n / max * 135;
  const path = trend.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.total)}`).join(' ');
  const indices = [...new Set([0, Math.floor((trend.length - 1) / 4), Math.floor((trend.length - 1) / 2), Math.floor((trend.length - 1) * 3 / 4), trend.length - 1])];
  const dateLabel = (date: string) => new Date(date + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily pass creation counts in India Standard Time" onMouseLeave={() => setHover(null)}>
    <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8d79df" stopOpacity=".23"/><stop offset="100%" stopColor="#8d79df" stopOpacity=".015"/></linearGradient></defs>
    {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={left} x2={width} y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="#edeef2" strokeDasharray="4 5"/><text x="3" y={y(max * i / 4) + 4} className="chart-label">{Math.round(max * i / 4)}</text></g>)}
    {trend.length > 0 && <><path d={`${path} L ${x(trend.length - 1)} ${bottom} L ${left} ${bottom} Z`} fill="url(#chart-fill)"/><path d={path} fill="none" stroke="#7963d6" strokeWidth="2.5" strokeLinejoin="round"/>{trend.map((d, i) => <g key={d.date}><circle cx={x(i)} cy={y(d.total)} r={d.total || hover === i ? 4 : 0} fill="#7963d6" stroke="white" strokeWidth="2"/><rect x={x(i) - (width - left) / trend.length / 2} y="15" width={(width - left) / trend.length} height="155" fill="transparent" onMouseEnter={() => setHover(i)}/></g>)}{indices.map(i => <text key={i} x={x(i)} y="191" textAnchor={i === 0 ? 'start' : i === trend.length - 1 ? 'end' : 'middle'} className="chart-label">{dateLabel(trend[i].date)}</text>)}</>}
  </svg><div className="chart-caption">{hover !== null && trend[hover] ? `${dateLabel(trend[hover].date)} · ${number(trend[hover].total)} passes created` : 'Hover over the chart to explore daily activity'}</div></div>;
}

function Distribution({ data, total }: { data: Breakdown[]; total: number }) {
  return <div className="distribution">{data.length ? data.slice(0, 6).map((row, i) => <div className="distribution-row" key={row.name}><div className="distribution-label"><span><i style={{ background: colors[i % colors.length] }}/>{row.name}</span><strong>{number(row.total)} <small>{percent(row.total, total)}%</small></strong></div><div className="bar-track"><span style={{ width: `${percent(row.total, total)}%`, background: colors[i % colors.length] }}/></div></div>) : <div className="empty-small">No passes in this selection</div>}</div>;
}

export default function Dashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState('0');
  const [institution, setInstitution] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exported, setExported] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?days=${days}&institution=${institution}`, { signal: current.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('The live data could not be loaded. Please refresh to try again.');
      const next: Analytics = await response.json();
      if (!current.signal.aborted) { setData(next); setError(''); }
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : 'Connection unavailable'); }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, [days, institution]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60000); return () => { clearInterval(timer); controller.current?.abort(); }; }, [load]);
  const s = data?.summary;
  const currentData = !!data && data.filters.days === Number(days) && data.filters.institution === institution;
  const exportCsv = () => {
    if (!data || !currentData || loading) return;
    const rows: (string | number)[][] = [['Pass analytics', 'Value'], ['Updated at (UTC)', data.updatedAt], ['Creation period (days, 0 = all time)', data.filters.days], ['Institution filter', data.filters.institution], ['Passes created', data.summary.total], ['Unique passes printed', data.summary.printed], ['Ready to print', data.summary.ready], ['Created today (IST)', data.summary.today], ['Print runs', data.summary.printRuns], ['Reprints', data.summary.reprints], [], ['Institution', 'Created', 'Printed', 'Ready to print'], ...data.institutions.map(r => [r.name, r.total, r.printed, r.ready]), [], ['Office', 'Total', 'Pending', 'Ready to print', 'Printed', 'Issued', 'Revoked'], ...data.offices.filter(office => office.id !== 'unassigned').map(r => [r.name, r.total, r.pending, r.ready, r.printed, r.issued, r.revoked]), [], ['Status', 'Passes'], ...data.statuses.map(r => [labels[r.name] || r.name, r.total]), [], ['Creation date (IST)', 'Passes'], ...data.trend.map(r => [r.date, r.total])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `pass-analytics-${data.updatedAt.slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); setExported(true); setTimeout(() => setExported(false), 2000);
  };
  const cards = [
    { label: 'Passes created', value: s?.total, icon: FilePlus2, color: 'purple', detail: `${number(s?.today ?? 0)} created today`, small: 'In selected creation period' },
    { label: 'Passes printed', value: s?.printed, icon: Printer, color: 'green', detail: `${percent(s?.printed ?? 0, s?.total ?? 0)}% print completion`, small: 'Unique passes, including issued' },
    ...['IISER', 'IIT', 'ICU'].map((name, i) => ({ label: `Assigned to ${name}`, value: data ? data.institutions.find(r => r.name === name)?.total ?? 0 : undefined, icon: Building2, color: ['blue', 'amber', 'pink'][i], detail: `${percent(data?.institutions.find(r => r.name === name)?.total ?? 0, s?.total ?? 0)}% of selected passes`, small: 'Institution allocation' }))
  ];
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="Pass Analytics home"><span className="brand-mark"><Fingerprint size={25}/></span><span>Pass<span className="brand-light">Analytics</span><small>CONFERENCE 2026</small></span></a><div className="sidebar-label">WORKSPACE</div><nav><a href="#overview" className="nav-link active"><LayoutDashboard size={18}/>Overview<span className="nav-active-dot"/></a><a href="#offices" className="nav-link"><Building2 size={18}/>Office statistics</a><a href="#institutions" className="nav-link"><Building2 size={18}/>Institutions</a><a href="#production" className="nav-link"><Printer size={18}/>Print production</a><a href="#breakdown" className="nav-link"><Layers3 size={18}/>Breakdowns</a></nav><div className="sidebar-event"><ShieldCheck size={24}/><strong>61st All India<br/>DGsP / IGPs Conference</strong><p>27 – 30 November 2026</p><span><MapPin size={12}/>Tirupati, Andhra Pradesh</span></div><div className="sidebar-footer"><span className="little-dot"/>Read-only analytics<small>Public access · No sign-in required</small></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span><strong>Overview</strong></div><div className="topbar-right"><span className={`connection ${error ? 'offline' : ''}`}><i/>{error ? 'Connection issue' : data ? 'Live database' : 'Connecting'}</span><span className="topbar-divider"/><div className="avatar">DG</div></div></header>
    <main id="overview"><div className="page-heading"><div><div className="eyebrow">CONFERENCE OPERATIONS</div><h1>Pass overview<span className="heading-dot">.</span></h1><p>A clear view of registrations, printing, and institution allocations.</p></div><button className="button export-button" onClick={exportCsv} disabled={!currentData || loading}>{exported ? <Check size={16}/> : <ArrowDownToLine size={16}/>} {exported ? 'Exported' : 'Export report'}</button></div>
    <div className="filterbar"><div className="filters"><label className="select-wrap"><Clock3 size={15}/><select aria-label="Creation period" value={days} onChange={e => setDays(e.target.value)}><option value="0">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><ChevronDown size={14}/></label><label className="select-wrap"><Building2 size={15}/><select aria-label="Institution" value={institution} onChange={e => setInstitution(e.target.value)}><option value="ALL">All institutions</option><option>IISER</option><option>IIT</option><option>ICU</option><option value="OTHER">Other</option></select><ChevronDown size={14}/></label></div><div className="refresh-group"><span>{data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST` : 'Loading live data'}</span><button className="icon-button" aria-label="Refresh analytics" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''}/></button></div></div>
    {error && <div className="error-banner" role="alert">{error} {data ? 'Showing the last successful snapshot; filters may not match.' : ''}<button onClick={() => void load()}>Try again <ArrowRight size={14}/></button></div>}
    <div className={`dashboard-content ${loading && data ? 'refreshing' : ''}`} aria-busy={loading}>
    <section className="stats-grid" aria-label="Main analytics">{cards.map(({ label, value, icon: Icon, color, detail, small }) => <article className="stat-card" key={label}><div className="stat-card-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={17}/></span></div><strong className="stat-value">{value === undefined ? <span className="skeleton"/> : number(value)}</strong><div className="stat-detail"><span className={`detail-dot ${color}`}/>{detail}</div><small>{small}</small></article>)}</section>
    <div className="chart-grid"><section className="panel trend-panel"><div className="panel-heading"><div><h2>Pass creation <span className="subtle-tag">{days === '0' ? 'All time' : `${days} days`}</span></h2><p>Daily registrations across the selected institutions</p></div><span className="legend"><i/>Created</span></div>{data ? <CreationChart trend={data.trend}/> : <div className="chart-loading"><Loader2 className="spinning" size={22}/>Loading creation history</div>}<div className="trend-footer"><span><Activity size={14}/>Every pass starts here.</span><span>All dates in IST</span></div></section>
    <section className="panel production-panel" id="production"><div className="panel-heading"><div><h2>Print progress</h2><p>From registration to a printed pass</p></div><Printer size={18} className="muted"/></div><div className="progress-ring" style={{ background: `conic-gradient(#7963d6 ${percent(s?.printed ?? 0, s?.total ?? 0)}%, #eeecf6 0)` }}><div><strong>{percent(s?.printed ?? 0, s?.total ?? 0)}<span>%</span></strong><small>completed</small></div></div><div className="progress-legend"><div><span><i className="dot purple"/>Printed</span><strong>{number(s?.printed ?? 0)}</strong></div><div><span><i className="dot amber"/>Ready to print</span><strong>{number(s?.ready ?? 0)}</strong></div><div><span><i className="dot gray"/>Draft / pending</span><strong>{number(s?.pending ?? 0)}</strong></div></div><div className="production-note"><ShieldCheck size={14}/>Prints recorded by the pass system</div></section></div>
    <section className="panel institution-panel" id="offices">
      <div className="panel-heading"><div><h2>Passes by office</h2></div></div>
      <div className="table-scroll">
        <table>
          <thead><tr>{['Office', 'Total', 'Pending', 'Ready to print', 'Printed', 'Issued', 'Revoked'].map(label =>
            <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data?.offices.filter(office => office.id !== 'unassigned').map(office => <tr key={office.id}>
            <td><strong>{office.name}</strong></td>
            {[office.total, office.pending, office.ready, office.printed, office.issued, office.revoked].map((count, index) =>
              <td key={index}>{number(count)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="panel institution-panel" id="institutions"><div className="panel-heading"><div><h2>Institution allocations</h2><p>Pass distribution and production readiness at a glance</p></div><span className="subtle-tag">{number(data?.institutions.length ?? 0)} active institutions</span></div><div className="table-scroll"><table><thead><tr><th>Institution</th><th>Passes created</th><th>Printed</th><th>Ready to print</th><th>Completion</th><th>Share of total</th></tr></thead><tbody>{['IISER', 'IIT', 'ICU', ...(data?.institutions.filter(r => !['IISER','IIT','ICU'].includes(r.name)).map(r => r.name) ?? [])].map((name, i) => { const row = data?.institutions.find(r => r.name === name); const rate = percent(row?.printed ?? 0, row?.total ?? 0); return <tr key={name}><td><div className="institution-name"><span className={`institution-icon ${['purple','blue','green','amber'][i % 4]}`}><Building2 size={17}/></span><div><strong>{name === 'OTHER' ? 'Other' : name}</strong><small>{name === 'IISER' ? 'Science education & research' : name === 'IIT' ? 'Institute of technology' : name === 'ICU' ? 'ICU allocation' : 'Additional institution'}</small></div></div></td><td className="table-number">{data ? number(row?.total ?? 0) : '—'}</td><td>{number(row?.printed ?? 0)}</td><td><span className={`count-chip ${row?.ready ? 'has-queue' : ''}`}>{number(row?.ready ?? 0)}</span></td><td><div className="completion-bar"><div><i style={{ width: `${rate}%` }}/></div><span>{rate}%</span></div></td><td>{percent(row?.total ?? 0, s?.total ?? 0)}%</td></tr>; })}</tbody></table></div><div className="table-footer"><span><CircleHelp size={13}/>Assignments are based on the institution saved on each pass.</span><strong>{number(s?.total ?? 0)} total passes</strong></div></section>
    <div className="breakdown-grid" id="breakdown"><section className="panel"><div className="panel-heading"><div><h2>Personnel categories</h2><p>Who the passes are created for</p></div><Layers3 size={17} className="muted"/></div><Distribution data={data?.categories ?? []} total={s?.total ?? 0}/><div className="mini-totals"><span>Internal <strong>{number(s?.internal ?? 0)}</strong></span><span>External <strong>{number(s?.external ?? 0)}</strong></span></div></section><section className="panel"><div className="panel-heading"><div><h2>Pass status</h2><p>Current state of selected passes</p></div><BarChart3 size={17} className="muted"/></div><Distribution data={(data?.statuses ?? []).map(r => ({ name: labels[r.name] || r.name, total: r.total, printed: 0, ready: 0 }))} total={s?.total ?? 0}/><div className="mini-totals"><span>Issued <strong>{number(s?.issued ?? 0)}</strong></span><span>Revoked <strong>{number(s?.revoked ?? 0)}</strong></span></div></section><section className="panel"><div className="panel-heading"><div><h2>Department mix</h2><p>Top departments by pass count</p></div><Building2 size={17} className="muted"/></div><Distribution data={data?.departments ?? []} total={s?.total ?? 0}/><div className="mini-totals"><span>Print runs <strong>{number(s?.printRuns ?? 0)}</strong></span><span>Reprints <strong>{number(s?.reprints ?? 0)}</strong></span></div></section></div>
    <section className="zone-strip"><div><span className="zone-icon"><ShieldCheck size={19}/></span><div><strong>Access zone coverage</strong><small>A pass may have access to multiple zones.</small></div></div><div className="zones"><span>Zone A <strong>{number(s?.zoneA ?? 0)}</strong></span><span>Zone B <strong>{number(s?.zoneB ?? 0)}</strong></span><span>Zone C <strong>{number(s?.zoneC ?? 0)}</strong></span></div></section>
    </div><footer className="page-footer"><span><ShieldCheck size={13}/>Aggregate insights only · Auto-refreshes every 60 seconds</span><span>61st All India DGsP / IGPs Conference 2026 <ArrowUpRight size={12}/></span></footer><p className="definitions">Date filters select passes by creation date. Printed counts include passes with recorded prints or a printed / issued status. Deleted passes are excluded.</p>
    </main></div></div>;
}
