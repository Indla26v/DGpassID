'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Layers3,
  LayoutDashboard,
  Loader2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  Analytics,
  Breakdown,
  OperationsDomain,
  PoliceCadreGroup,
} from '@/lib/types';
import {
  buildPoliceTelemetryFromSnapshot,
  CAMPUS_ACCESS_ZONES,
  generatePoliceCsvRows,
  TOTAL_OFFICIAL_FORCE_ALLOCATION,
} from '@/lib/police-data';

const number = (n: number) => n.toLocaleString('en-IN');
const percent = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  READY_TO_PRINT: 'Ready to print',
  PRINTED: 'Printed',
  ISSUED: 'Issued',
  REVOKED: 'Revoked',
};

const DISTRIBUTION_COLORS = [
  '#0B2545',
  '#8B1A1A',
  '#059669',
  '#1D4ED8',
  '#B45309',
  '#6B21A8',
  '#475569',
];

function CreationChart({ trend }: { trend: Analytics['trend'] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(4, ...trend.map((d) => d.total));
  const width = 800;
  const height = 210;
  const left = 36;
  const bottom = 175;
  const x = (i: number) => left + (i / Math.max(1, trend.length - 1)) * (width - left - 16);
  const y = (n: number) => bottom - (n / max) * 140;

  const path = trend.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.total)}`).join(' ');
  const indices = [
    ...new Set([
      0,
      Math.floor((trend.length - 1) / 4),
      Math.floor((trend.length - 1) / 2),
      Math.floor(((trend.length - 1) * 3) / 4),
      trend.length - 1,
    ]),
  ];

  const dateLabel = (date: string) =>
    new Date(date + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });

  return (
    <div className="chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Daily pass creation counts in India Standard Time"
        className="chart-svg"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="chart-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b2545" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0b2545" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
          const val = Math.round((max * i) / 4);
          const yPos = y((max * i) / 4);
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - 10}
                y1={yPos}
                y2={yPos}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text x="4" y={yPos + 4} className="chart-axis-label">
                {val}
              </text>
            </g>
          );
        })}

        {trend.length > 0 && (
          <>
            <path
              d={`${path} L ${x(trend.length - 1)} ${bottom} L ${left} ${bottom} Z`}
              fill="url(#chart-area-fill)"
            />
            <path
              d={path}
              fill="none"
              stroke="#0b2545"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {trend.map((d, i) => {
              const cx = x(i);
              const cy = y(d.total);
              const isHovered = hoverIndex === i;
              return (
                <g key={d.date}>
                  {isHovered && (
                    <line
                      x1={cx}
                      x2={cx}
                      y1={20}
                      y2={bottom}
                      className="chart-interactive-guide"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : d.total ? 3.5 : 0}
                    fill={isHovered ? '#8b1a1a' : '#0b2545'}
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 3 : 2}
                  />
                  <rect
                    x={cx - (width - left) / trend.length / 2}
                    y="10"
                    width={(width - left) / trend.length}
                    height="170"
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(i)}
                  />
                </g>
              );
            })}
            {indices.map((i) => (
              <text
                key={i}
                x={x(i)}
                y="198"
                textAnchor={i === 0 ? 'start' : i === trend.length - 1 ? 'end' : 'middle'}
                className="chart-axis-label"
              >
                {dateLabel(trend[i].date)}
              </text>
            ))}
          </>
        )}
      </svg>

      <div className="chart-tooltip-badge">
        <Activity size={14} />
        {hoverIndex !== null && trend[hoverIndex]
          ? `${dateLabel(trend[hoverIndex].date)} · ${number(trend[hoverIndex].total)} passes created`
          : 'Hover along the trendline to inspect daily creation volume'}
      </div>
    </div>
  );
}

function Distribution({ data, total }: { data: Breakdown[]; total: number }) {
  if (!data.length) {
    return (
      <div className="distribution-list">
        <p className="metric-caption">No passes in this selection</p>
      </div>
    );
  }

  return (
    <div className="distribution-list">
      {data.slice(0, 6).map((row, i) => {
        const pct = percent(row.total, total);
        const color = DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length];
        return (
          <div className="distribution-row" key={row.name}>
            <div className="distribution-header">
              <div className="distribution-label-wrap">
                <span className="distribution-dot" style={{ backgroundColor: color }} />
                <span title={row.name}>{row.name}</span>
              </div>
              <span className="distribution-val">
                {number(row.total)} <small>({pct}%)</small>
              </span>
            </div>
            <div className="distribution-bar-track">
              <div
                className="distribution-bar-fill"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [domain, setDomain] = useState<OperationsDomain>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [data, setData] = useState<Analytics | null>(null);
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({ 'ZONE-1': true });
  const [selectedCadre, setSelectedCadre] = useState<'ALL' | PoliceCadreGroup>('ALL');
  const [days, setDays] = useState('0');
  const [institution, setInstitution] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exported, setExported] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?days=${days}&institution=${institution}`, {
        signal: current.signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('The live data could not be loaded. Please refresh to try again.');
      }
      const next: Analytics = await response.json();
      if (!current.signal.aborted) {
        setData(next);
        setError('');
      }
    } catch (e) {
      if (!current.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Connection unavailable');
      }
    } finally {
      if (!current.signal.aborted) {
        setLoading(false);
      }
    }
  }, [days, institution]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 60000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [load]);

  const s = data?.summary;
  const policeTelemetry = useMemo(
    () => buildPoliceTelemetryFromSnapshot(data?.police, data?.updatedAt ?? new Date().toISOString()),
    [data]
  );
  const ps = policeTelemetry.summary;
  const totalPolice = ps.totalForce;
  const totalCampus = s?.total ?? 0;
  const grandTotal = totalPolice + totalCampus;

  const toggleZoneExpanded = (zoneId: string) => {
    setExpandedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const toggleAllZones = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const z of policeTelemetry.zones) {
      next[z.zoneId] = expand;
    }
    setExpandedZones(next);
  };

  const exportCsv = () => {
    if (loading && !data) return;
    const timestamp = new Date().toISOString().slice(0, 10);

    const instExportRows = () => {
      if (!data) return [];
      const map = new Map<string, { total: number; printed: number; ready: number }>();
      for (const r of data.institutions) {
        const instName = r.name === 'ICU' ? 'ICI' : r.name;
        const current = map.get(instName) ?? { total: 0, printed: 0, ready: 0 };
        map.set(instName, {
          total: current.total + r.total,
          printed: current.printed + r.printed,
          ready: current.ready + r.ready,
        });
      }
      return Array.from(map.entries()).map(([instName, counts]) => [
        instName,
        counts.total,
        counts.printed,
        counts.ready,
      ]);
    };

    const campusRows: (string | number)[][] = data
      ? [
          ['--- CAMPUS & AGENCIES PASS OPERATIONS ---', ''],
          ['Updated at (UTC)', data.updatedAt],
          ['Creation period (days, 0 = all time)', data.filters.days],
          ['Institution filter', data.filters.institution],
          ['Passes created', data.summary.total],
          ['Pending approval', data.summary.pending],
          ['Ready to print', data.summary.ready],
          ['Unique passes printed', data.summary.printed],
          ['Passes issued', data.summary.issued],
          ['Created today (IST)', data.summary.today],
          ['Print runs', data.summary.printRuns],
          ['Reprints', data.summary.reprints],
          [],
          ['Institution', 'Created', 'Printed', 'Ready to print'],
          ...instExportRows(),
          [],
          ['Office', 'Total', 'Pending', 'Ready to print', 'Printed', 'Issued', 'Revoked'],
          ...data.offices
            .filter((office) => office.id !== 'unassigned')
            .map((r) => [r.name, r.total, r.pending, r.ready, r.printed, r.issued, r.revoked]),
          [],
          ['Status', 'Passes'],
          ...data.statuses.map((r) => [STATUS_LABELS[r.name] || r.name, r.total]),
          [],
          ['Creation date (IST)', 'Passes'],
          ...data.trend.map((r) => [r.date, r.total]),
        ]
      : [];

    const policeRows = generatePoliceCsvRows(policeTelemetry);

    const rows: (string | number)[][] =
      domain === 'all'
        ? [
            ['61st All India DGPs / IGPs Conference 2026 - Unified Pass Operations Report', ''],
            ['Report Scope', 'All Operations (Police Bandobusth Force + Campus & Agencies)'],
            ['Generated At (UTC)', new Date().toISOString()],
            [],
            ...policeRows,
            [],
            ...campusRows,
          ]
        : domain === 'police'
        ? [
            ['61st All India DGPs / IGPs Conference 2026 - Police Bandobusth Force Report', ''],
            ['Report Scope', 'Police Bandobusth Force Operations'],
            ['Generated At (UTC)', new Date().toISOString()],
            [],
            ...policeRows,
          ]
        : [
            ['61st All India DGPs / IGPs Conference 2026 - Campus & Agencies Report', ''],
            ['Report Scope', 'Campus & Agencies Pass Operations'],
            ['Generated At (UTC)', new Date().toISOString()],
            [],
            ...campusRows,
          ];

    const csv = rows
      .map((row) =>
        row.map((value) => `"${String(value).replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`).join(',')
      )
      .join('\r\n');

    const filename =
      domain === 'all'
        ? `conference-pass-operations-${timestamp}.csv`
        : domain === 'police'
        ? `police-bandobusth-telemetry-${timestamp}.csv`
        : `campus-agencies-analytics-${timestamp}.csv`;

    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  // KPI cards aligned with web/src/components/dashboard/DashboardPortal.tsx,
  // web/src/components/police/PoliceForcePortal.tsx & web/src/components/common/StatsCards.tsx
  const unifiedKpiCards = [
    {
      label: 'Passes registered',
      value: data ? grandTotal : undefined,
      icon: Layers3,
      tone: 'navy',
      badge: `${number(totalPolice)} police · ${number(totalCampus)} campus`,
      detail: 'Combined live registry',
    },
    {
      label: 'Ready to print',
      value: data ? ps.readyToPrintBadges + (s?.ready ?? 0) : undefined,
      icon: Clock3,
      tone: 'amber',
      badge: `${number(ps.readyToPrintBadges)} police · ${number(s?.ready ?? 0)} campus`,
      detail: 'Queued for badge printing',
    },
    {
      label: 'Badges printed',
      value: data ? ps.printedBadges + (s?.printed ?? 0) : undefined,
      icon: Printer,
      tone: 'blue',
      badge: `${percent(ps.printedBadges + (s?.printed ?? 0), grandTotal)}% of registered`,
      detail: 'Police RFID + Campus cards',
    },
    {
      label: 'Passes issued',
      value: data ? ps.collectedBadges + (s?.issued ?? 0) : undefined,
      icon: CheckCircle2,
      tone: 'emerald',
      badge: `${percent(ps.collectedBadges + (s?.issued ?? 0), grandTotal)}% handed over`,
      detail: 'Distributed to cardholders',
    },
    {
      label: 'Police duty assigned',
      value: data ? ps.assignedDuty : undefined,
      icon: ShieldCheck,
      tone: 'rose',
      badge: `${ps.deploymentPercentage}% of ${number(totalPolice)} registered`,
      detail: `Scheme target: ${number(TOTAL_OFFICIAL_FORCE_ALLOCATION)}`,
    },
  ];

  const policeKpiCards = [
    {
      label: 'Total Personnel',
      value: data ? ps.totalForce : undefined,
      icon: Users,
      tone: 'navy',
      badge: `Scheme target ${number(ps.targetForceAllocation)}`,
      detail: `${percent(ps.totalForce, ps.targetForceAllocation)}% of scheme onboarded`,
    },
    {
      label: 'Duty assigned',
      value: data ? ps.assignedDuty : undefined,
      icon: UserCheck,
      tone: 'emerald',
      badge: `${ps.deploymentPercentage}% deployed`,
      detail: `${number(ps.unassignedZone)} without zone`,
    },
    {
      label: 'Duty pending',
      value: data ? ps.pendingDuty : undefined,
      icon: Clock3,
      tone: 'rose',
      badge: `${100 - ps.deploymentPercentage}% unassigned`,
      detail: 'Awaiting zone / sector posting',
    },
    {
      label: 'Passes printed',
      value: data ? ps.printedBadges : undefined,
      icon: Printer,
      tone: 'blue',
      badge: `${number(ps.readyToPrintBadges)} ready to print`,
      detail: `${percent(ps.printedBadges, ps.totalForce)}% printed`,
    },
    {
      label: 'Handed over',
      value: data ? ps.collectedBadges : undefined,
      icon: CheckCircle2,
      tone: 'purple',
      badge: `${ps.handoverPercentage}% collected`,
      detail: 'Verified officer handover',
    },
  ];

  const campusKpiCards = [
    {
      label: 'Passes created',
      value: s?.total,
      icon: ShieldCheck,
      tone: 'navy',
      badge: `${number(s?.today ?? 0)} created today`,
      detail: 'In selected period & filter',
    },
    {
      label: 'Pending approval',
      value: s?.pending,
      icon: Clock3,
      tone: 'purple',
      badge: `${percent(s?.pending ?? 0, s?.total ?? 0)}% in review`,
      detail: 'Draft & pending approval',
    },
    {
      label: 'Ready to print',
      value: s?.ready,
      icon: Printer,
      tone: 'amber',
      badge: `${percent(s?.ready ?? 0, s?.total ?? 0)}% in print queue`,
      detail: 'Approved for card printing',
    },
    {
      label: 'Passes printed',
      value: s?.printed,
      icon: Users,
      tone: 'emerald',
      badge: `${percent(s?.printed ?? 0, s?.total ?? 0)}% completed`,
      detail: `${number(s?.printRuns ?? 0)} print runs · ${number(s?.reprints ?? 0)} reprints`,
    },
    {
      label: 'Passes issued',
      value: s?.issued,
      icon: CheckCircle2,
      tone: 'blue',
      badge: `${percent(s?.issued ?? 0, s?.total ?? 0)}% handed over`,
      detail: `${number(s?.revoked ?? 0)} revoked`,
    },
  ];

  const displayedKpiCards =
    domain === 'police'
      ? policeKpiCards
      : domain === 'campus'
      ? campusKpiCards
      : unifiedKpiCards;

  const datePresets = [
    { value: '0', label: 'All time' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
  ];

  const sidebarSections = [
    { id: 'overview', label: 'Overview', hint: 'Live summary & KPIs', Icon: LayoutDashboard },
    ...(domain === 'all' || domain === 'police'
      ? [
          { id: 'bandobusth-zones', label: 'Bandobusth Zones', hint: '8 official zones & sectors', Icon: ShieldCheck },
          { id: 'police-districts', label: 'Districts & Ranks', hint: 'Units & rank cadres', Icon: Users },
          { id: 'issuing-counters', label: 'Counters & Units', hint: 'Desks & components', Icon: MapPin },
        ]
      : []),
    ...(domain === 'all' || domain === 'campus'
      ? [
          { id: 'campus-charts', label: 'Creation & Print', hint: 'Velocity & production', Icon: TrendingUp },
          { id: 'offices', label: 'Passes by Office', hint: 'Subdivision police offices', Icon: Building2 },
          { id: 'institutions', label: 'Institutions', hint: 'IISER, IIT, ICI & agencies', Icon: Layers3 },
          { id: 'breakdown', label: 'Breakdowns', hint: 'Categories, status, depts', Icon: BarChart3 },
          { id: 'zones', label: 'Access Zones', hint: 'Zone A, B & C clearance', Icon: Shield },
        ]
      : []),
  ];

  const filteredRanks =
    selectedCadre === 'ALL'
      ? policeTelemetry.ranks
      : policeTelemetry.ranks.filter((r) => r.cadre === selectedCadre);

  const visibleRanks = filteredRanks.filter((r) => r.totalPersonnel > 0 || selectedCadre !== 'ALL');
  const displayRanks = visibleRanks.length > 0 ? visibleRanks : filteredRanks;

  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>

      {/* Institutional Header matching web/src/components/common/Navbar.tsx */}
      <header className="web-header">
        <div className="workspace-width header-brand-bar">
          <div className="header-brand-left">
            <div className="header-logo-box">
              <img src="/ap-police-logo.png" alt="Andhra Pradesh Police Emblem" width={40} height={40} />
            </div>
            <div>
              <p className="header-eyebrow">Andhra Pradesh Police · IISER Tirupati</p>
              <h1 className="header-title">
                61st All India DGPs / IGPs Conference <span>2026</span>
              </h1>
            </div>
          </div>

          <div className="header-brand-right">
            <img src="/app-logo.svg" alt="Conference Pass" width={38} height={38} />
            <div className="header-app-meta">
              Conference Pass
              <strong>Live Operations Analytics</strong>
            </div>
            <div className="header-logo-box">
              <img src="/IISER_Tirupati_logo.png" alt="IISER Tirupati Logo" width={40} height={40} />
            </div>
            <div className="header-logo-box">
              <img
                src="/tirupati-district-police-crest.png"
                alt="Tirupati District Police Crest"
                width={40}
                height={40}
              />
            </div>
          </div>
        </div>

        <div className="header-subnav">
          <div className="workspace-width header-subnav-inner">
            <nav aria-label="Operations domain" className="header-nav-pills">
              <button
                type="button"
                aria-current={domain === 'all' ? 'page' : undefined}
                className={`header-nav-pill ${domain === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setDomain('all');
                  setActiveSection('overview');
                }}
              >
                <LayoutDashboard size={15} aria-hidden="true" />
                <span>Dashboard</span>
                <span className="header-nav-count">{data ? number(grandTotal) : '—'}</span>
              </button>
              <button
                type="button"
                aria-current={domain === 'police' ? 'page' : undefined}
                className={`header-nav-pill ${domain === 'police' ? 'active' : ''}`}
                onClick={() => {
                  setDomain('police');
                  setActiveSection('overview');
                }}
              >
                <ShieldCheck size={15} aria-hidden="true" />
                <span>Police Force</span>
                <span className="header-nav-count">{data ? number(totalPolice) : '—'}</span>
              </button>
              <button
                type="button"
                aria-current={domain === 'campus' ? 'page' : undefined}
                className={`header-nav-pill ${domain === 'campus' ? 'active' : ''}`}
                onClick={() => {
                  setDomain('campus');
                  setActiveSection('overview');
                }}
              >
                <Building2 size={15} aria-hidden="true" />
                <span>Campus &amp; Agencies</span>
                <span className="header-nav-count">{data ? number(totalCampus) : '—'}</span>
              </button>
            </nav>

            <div className="header-subnav-right">
              <div className={`live-status-pill ${error ? 'offline' : ''}`} role="status" aria-live="polite">
                <span className="beacon" />
                <span>{error ? 'Connection issue' : 'Live telemetry'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="workspace-body">
        {/* Collapsible SectionSidebar matching web/src/components/common/SectionSidebar.tsx */}
        <aside className="section-sidebar-slot" aria-label="Section menu">
          <nav
            aria-label="Analytics sections"
            className={`section-sidebar-nav ${sidebarCollapsed ? 'collapsed' : ''}`}
          >
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
              title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {!sidebarCollapsed && <span>Analytics Menu</span>}
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <ul className="sidebar-section-list">
              {sidebarSections.map(({ id, label, hint, Icon }) => {
                const isActive = activeSection === id;
                return (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={() => setActiveSection(id)}
                      aria-current={isActive ? 'location' : undefined}
                      title={sidebarCollapsed ? label : undefined}
                      className={`sidebar-section-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={17} className="sidebar-section-icon" aria-hidden="true" />
                      {!sidebarCollapsed && (
                        <span style={{ minWidth: 0 }}>
                          <span className="sidebar-section-label">{label}</span>
                          <span className="sidebar-section-hint">{hint}</span>
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>

            {!sidebarCollapsed && (
              <div className="sidebar-event-card">
                <div className="sidebar-event-badge">
                  <ShieldCheck size={14} />
                  <span>Official Registry</span>
                </div>
                <div className="sidebar-event-title">
                  61st All India DGPs / IGPs Conference
                </div>
                <div className="sidebar-event-meta">27 – 30 November 2026</div>
                <div className="sidebar-event-meta">IISER &amp; IIT Tirupati, AP</div>
              </div>
            )}
          </nav>
        </aside>

        {/* Main Workspace */}
        <main id="workspace" className="workspace-width workspace-main">
          <div className="workspace-stack">
            {/* Mobile Section Pill Tabs */}
            <nav aria-label="Analytics sections" className="mobile-section-tabs">
              {sidebarSections.map(({ id, label, Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => setActiveSection(id)}
                  className={`mobile-section-tab ${activeSection === id ? 'active' : ''}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                </a>
              ))}
            </nav>

            {/* Operations Banner matching web/src/components/common/OperationsHeader.tsx */}
            <section className="operations-banner" aria-label="Operations summary header">
              <div className="operations-banner-text">
                <div className="operations-eyebrow">
                  <ShieldCheck size={13} />
                  <span>Tirupati District Police · Aggregate Command Telemetry</span>
                </div>
                <h2 className="operations-heading">
                  {domain === 'all'
                    ? 'Pass Operations Dashboard'
                    : domain === 'police'
                    ? 'Police Bandobusth Force Analytics'
                    : 'Campus & Agencies Pass Analytics'}
                </h2>
                <p className="operations-description">
                  {domain === 'all'
                    ? 'Live police bandobusth deployment across 8 zones, campus pass issuance, print production and office allocations.'
                    : domain === 'police'
                    ? 'Real-time bandobusth strength across 8 zones, sectors, districts, ranks and badge distribution desks.'
                    : 'Real-time pass creation velocity, print production progress, subdivision office queues and institutional allocations.'}
                </p>
              </div>

              <div className="operations-banner-actions">
                <span className="banner-timestamp">
                  {data
                    ? `Updated ${new Date(data.updatedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })} IST`
                    : 'Loading live snapshot…'}
                </span>
                <button
                  type="button"
                  className="pill-btn pill-btn-outline pill-btn-sm"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? 'spinning' : ''} aria-hidden="true" />
                  <span>Refresh data</span>
                </button>
                <button
                  type="button"
                  className="pill-btn pill-btn-crimson pill-btn-sm"
                  onClick={exportCsv}
                  disabled={loading && !data}
                >
                  {exported ? <Check size={14} aria-hidden="true" /> : <ArrowDownToLine size={14} aria-hidden="true" />}
                  <span>{exported ? 'Report Exported' : 'Export CSV'}</span>
                </button>
              </div>
            </section>

            {/* Filter Toolbar */}
            <section className="operations-panel filter-toolbar" aria-label="Analytics filters">
              <div className="filter-controls-group">
                {(domain === 'all' || domain === 'campus') && (
                  <>
                    <div className="pill-segmented-control" role="group" aria-label="Creation period">
                      {datePresets.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          className={`pill-segment ${days === preset.value ? 'active' : ''}`}
                          onClick={() => setDays(preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <label className="pill-select-wrapper">
                      <Building2 size={14} aria-hidden="true" />
                      <select
                        aria-label="Filter by institution"
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                      >
                        <option value="ALL">All institutions</option>
                        <option value="IISER">IISER Tirupati</option>
                        <option value="IIT">IIT Tirupati</option>
                        <option value="ICI">ICI: Indian Culinary Institute</option>
                        <option value="OTHER">Other institutions</option>
                      </select>
                      <ChevronDown size={14} aria-hidden="true" />
                    </label>
                  </>
                )}

                {domain === 'police' && (
                  <span className="pill-tag">
                    <ShieldCheck size={13} />
                    Live Registry: {number(totalPolice)} Registered · {number(TOTAL_OFFICIAL_FORCE_ALLOCATION)} Scheme Target
                  </span>
                )}
              </div>

              <div className="filter-controls-group">
                <span className="pill-tag">
                  <Shield size={12} />
                  Read-only aggregate snapshot · Auto-refresh 60s
                </span>
              </div>
            </section>

            {/* Error Banner */}
            {error && (
              <div className="error-banner" role="alert">
                <div className="error-banner-content">
                  <AlertCircle size={18} />
                  <span>
                    {error}{' '}
                    {data ? 'Showing the last successful snapshot; filters may not match.' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="pill-btn pill-btn-outline pill-btn-sm"
                  onClick={() => void load()}
                >
                  <span>Try again</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )}

            {/* Key Performance Indicators */}
            <section
              className={`stats-grid ${loading && data ? 'refreshing' : ''}`}
              id="overview"
              aria-label="Key Performance Indicators"
            >
              {displayedKpiCards.map(({ label, value, icon: Icon, tone, badge, detail }) => (
                <article className="operations-metric" key={label}>
                  <div className="metric-top">
                    <span className="metric-label">{label}</span>
                    <div className={`metric-icon-circle metric-tone-${tone}`}>
                      <Icon size={17} aria-hidden="true" />
                    </div>
                  </div>
                  <div className="stat-value">
                    {value === undefined ? <span className="skeleton-box" /> : number(value)}
                  </div>
                  <div className="metric-footer">
                    <span className={`metric-badge metric-tone-${tone}`}>{badge}</span>
                    <span className="metric-caption">{detail}</span>
                  </div>
                </article>
              ))}
            </section>

            {/* ================================================================ */}
            {/* POLICE BANDOBUSTH FORCE MODULE (Live DB + 8 Official Zones)      */}
            {/* ================================================================ */}
            {(domain === 'all' || domain === 'police') && (
              <>
                <section id="bandobusth-zones" aria-labelledby="bandobusth-zones-heading">
                  <div className="section-headline">
                    <div className="section-headline-text">
                      <h2 id="bandobusth-zones-heading">
                        <ShieldCheck size={19} aria-hidden="true" />
                        Bandobusth Zones Command Matrix
                      </h2>
                      <p>
                        Live police force deployment across the 8 official Bandobusth zones against scheme allocations ({number(TOTAL_OFFICIAL_FORCE_ALLOCATION)} total scheme strength)
                      </p>
                    </div>
                    <div className="section-headline-actions">
                      <button
                        type="button"
                        className="pill-btn pill-btn-outline pill-btn-sm"
                        onClick={() => toggleAllZones(true)}
                      >
                        Expand all sectors
                      </button>
                      <button
                        type="button"
                        className="pill-btn pill-btn-outline pill-btn-sm"
                        onClick={() => toggleAllZones(false)}
                      >
                        Collapse all sectors
                      </button>
                    </div>
                  </div>

                  <div className="bandobusth-command-grid">
                    {policeTelemetry.zones.map((zone) => {
                      const isExpanded = expandedZones[zone.zoneId] ?? false;
                      const isComplete = zone.currentStrength >= zone.targetAllocation && zone.targetAllocation > 0;

                      return (
                        <article className="zone-command-card" key={zone.zoneId}>
                          <div className="zone-card-header">
                            <div className="zone-card-header-left">
                              <span className="zone-num-pill">ZONE {zone.zoneNumber}</span>
                              <h3 className="zone-card-title">{zone.name}</h3>
                              <p className="zone-card-subtitle">{zone.subtitle}</p>
                            </div>
                            <span className={`zone-strength-pill ${isComplete ? 'complete' : ''}`}>
                              {number(zone.currentStrength)} / {number(zone.targetAllocation)}
                            </span>
                          </div>

                          <div className="zone-card-body">
                            <div className="zone-progress-box">
                              <div className="zone-progress-header">
                                <span>Live Scheme Fill Rate</span>
                                <strong>
                                  {number(zone.currentStrength)} / {number(zone.targetAllocation)} ({zone.fillRatePercentage}%)
                                </strong>
                              </div>
                              <div className="zone-progress-track">
                                <div
                                  className={`zone-progress-bar ${isComplete ? 'complete' : ''}`}
                                  style={{
                                    width: `${Math.min(100, zone.currentStrength > 0 ? Math.max(3, zone.fillRatePercentage) : 0)}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <div className="zone-metrics-quad">
                              <div className="zone-metric-cell">
                                <span className="zone-metric-label">Scheme Target</span>
                                <span className="zone-metric-value">{number(zone.targetAllocation)}</span>
                              </div>
                              <div className="zone-metric-cell">
                                <span className="zone-metric-label">Registered</span>
                                <span className="zone-metric-value">{number(zone.currentStrength)}</span>
                              </div>
                              <div className="zone-metric-cell">
                                <span className="zone-metric-label">Printed</span>
                                <span className="zone-metric-value">{number(zone.printed)}</span>
                              </div>
                              <div className="zone-metric-cell">
                                <span className="zone-metric-label">Handed Over</span>
                                <span className="zone-metric-value">{number(zone.collected)}</span>
                              </div>
                            </div>

                            <div>
                              <button
                                type="button"
                                className="zone-toggle-btn"
                                onClick={() => toggleZoneExpanded(zone.zoneId)}
                                aria-expanded={isExpanded}
                              >
                                <span>
                                  Operational Sectors ({zone.sectors.length}{' '}
                                  {zone.sectors.length === 1 ? 'Sector' : 'Sectors'})
                                </span>
                                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>

                              {isExpanded && (
                                <div className="zone-sectors-list">
                                  {zone.sectors.map((sector) => (
                                    <div className="zone-sector-item" key={sector.number}>
                                      <div style={{ minWidth: 0 }}>
                                        <span className="zone-sector-number">{sector.number}</span>
                                        <span className="zone-sector-name">{sector.name}</span>
                                      </div>
                                      <div className="zone-sector-allocation">
                                        {number(sector.assignedCount)}
                                        {sector.targetAllocation > 0 ? (
                                          <small style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                                            {' '}
                                            / {number(sector.targetAllocation)}
                                          </small>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                {/* Police Districts & Ranks Dual Grid */}
                <div className="police-dual-grid" id="police-districts">
                  {/* Police Ranks Breakdown */}
                  <section className="operations-panel" aria-labelledby="ranks-heading">
                    <header className="panel-heading">
                      <div>
                        <h2 id="ranks-heading" className="panel-heading-title">
                          <Users size={18} className="crimson-icon" aria-hidden="true" />
                          <span>Police Ranks Breakdown</span>
                        </h2>
                        <p className="panel-description">
                          Live strength across Civil &amp; Armed Reserve rank groups (including ASI/HC)
                        </p>
                      </div>
                      <div className="ranks-cadre-filters">
                        {(['ALL', 'Senior Officers', 'Subordinate Officers', 'Field Ranks', 'Armed Reserve'] as const).map(
                          (cadre) => (
                            <button
                              key={cadre}
                              type="button"
                              className={`ranks-cadre-pill ${selectedCadre === cadre ? 'active' : ''}`}
                              onClick={() => setSelectedCadre(cadre)}
                            >
                              {cadre === 'ALL' ? 'All Cadres' : cadre}
                            </button>
                          )
                        )}
                      </div>
                    </header>

                    <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="ranks-heading">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Rank Group</th>
                            <th scope="col">Cadre</th>
                            <th scope="col" className="numeric">Registered</th>
                            <th scope="col" className="numeric">Assigned</th>
                            <th scope="col" className="numeric">Printed</th>
                            <th scope="col" className="numeric">Handed Over</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRanks.map((r) => (
                            <tr key={r.group}>
                              <th scope="row">
                                <div>
                                  <strong>{r.group}</strong>
                                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                                    {r.label}
                                  </div>
                                </div>
                              </th>
                              <td>
                                <span
                                  className={`table-pill-chip ${
                                    r.cadre === 'Senior Officers'
                                      ? 'navy'
                                      : r.cadre === 'Subordinate Officers'
                                      ? 'emerald'
                                      : r.cadre === 'Armed Reserve'
                                      ? 'ruby'
                                      : 'slate'
                                  }`}
                                >
                                  {r.cadre}
                                </span>
                              </td>
                              <td className="numeric">
                                <strong>{number(r.totalPersonnel)}</strong>
                              </td>
                              <td className="numeric">{number(r.assignedDuty)}</td>
                              <td className="numeric">
                                <span className={`table-pill-chip ${r.badgesPrinted > 0 ? 'emerald' : 'slate'}`}>
                                  {number(r.badgesPrinted)}
                                </span>
                              </td>
                              <td className="numeric">
                                <span className={`table-pill-chip ${r.badgesHandedOver > 0 ? 'blue' : 'slate'}`}>
                                  {number(r.badgesHandedOver)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <footer className="panel-mini-footer">
                      <span>
                        Cadre total: <strong>{number(displayRanks.reduce((acc, r) => acc + r.totalPersonnel, 0))}</strong>
                      </span>
                      <span>
                        Duty assigned: <strong>{number(displayRanks.reduce((acc, r) => acc + r.assignedDuty, 0))}</strong>
                      </span>
                    </footer>
                  </section>

                  {/* AP Districts & Special Units */}
                  <section className="operations-panel" aria-labelledby="districts-heading">
                    <header className="panel-heading">
                      <div>
                        <h2 id="districts-heading" className="panel-heading-title">
                          <MapPin size={18} className="crimson-icon" aria-hidden="true" />
                          <span>Districts &amp; Special Units</span>
                        </h2>
                        <p className="panel-description">
                          Live police force contribution by AP district or special unit
                        </p>
                      </div>
                      <span className="pill-tag">{number(policeTelemetry.districts.length)} Units</span>
                    </header>

                    <div className="distribution-list" style={{ maxHeight: 420, overflowY: 'auto' }}>
                      {policeTelemetry.districts.length > 0 ? (
                        policeTelemetry.districts.map((dist, idx) => {
                          const pct = percent(dist.total, totalPolice);
                          const color = DISTRIBUTION_COLORS[idx % DISTRIBUTION_COLORS.length];
                          return (
                            <div className="distribution-row" key={dist.name}>
                              <div className="distribution-header">
                                <div className="distribution-label-wrap">
                                  <span className="distribution-dot" style={{ backgroundColor: color }} />
                                  <span>{dist.name}</span>
                                </div>
                                <span className="distribution-val">
                                  {number(dist.total)} <small>({pct}%)</small>
                                </span>
                              </div>
                              <div className="distribution-bar-track">
                                <div
                                  className="distribution-bar-fill"
                                  style={{ width: `${pct}%`, backgroundColor: color }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="metric-caption">No police unit records found yet.</p>
                      )}
                    </div>

                    <footer className="panel-mini-footer">
                      <span>
                        Participating units: <strong>{number(policeTelemetry.districts.length)}</strong>
                      </span>
                      <span>
                        Total force: <strong>{number(totalPolice)}</strong>
                      </span>
                    </footer>
                  </section>
                </div>

                {/* Issuing Counters Desk & Security Tactical Components */}
                <section id="issuing-counters" aria-labelledby="counters-heading">
                  <div className="section-headline">
                    <div className="section-headline-text">
                      <h2 id="counters-heading">
                        <MapPin size={19} aria-hidden="true" />
                        Issuing Counters &amp; Tactical Units
                      </h2>
                      <p>
                        Badge distribution desks and specialised security component assignments from the live registry
                      </p>
                    </div>
                    <span className="pill-tag">
                      <CheckCircle2 size={13} />
                      6 Issuing Desks
                    </span>
                  </div>

                  <div className="counters-grid">
                    {policeTelemetry.counters.map((counter) => (
                      <article className="counter-card" key={counter.counterId}>
                        <div className="counter-header">
                          <div className="counter-icon-wrap">
                            <MapPin size={18} aria-hidden="true" />
                          </div>
                          <div className="counter-info">
                            <h4>{counter.name}</h4>
                            <p>{counter.location}</p>
                          </div>
                        </div>

                        <div className="counter-stats-row">
                          <div className="counter-stat-item">
                            <span>Allocated</span>
                            <strong>{number(counter.allocatedBadges)}</strong>
                          </div>
                          <div className="counter-stat-item">
                            <span>Printed</span>
                            <strong>{number(counter.printedBadges)}</strong>
                          </div>
                          <div className="counter-stat-item">
                            <span>Handed Over</span>
                            <strong style={{ color: 'var(--accent-emerald)' }}>
                              {number(counter.collectedBadges)}
                            </strong>
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              fontWeight: 600,
                            }}
                          >
                            <span>Handover Fulfillment</span>
                            <strong style={{ color: 'var(--accent-emerald)' }}>
                              {counter.fulfillmentPercentage}%
                            </strong>
                          </div>
                          <div className="counter-progress-track">
                            <div
                              className="counter-progress-bar"
                              style={{ width: `${counter.fulfillmentPercentage}%` }}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="operations-panel" style={{ marginTop: 18 }}>
                    <header className="panel-heading">
                      <div>
                        <h3 className="panel-heading-title">
                          <ShieldAlert size={18} className="crimson-icon" aria-hidden="true" />
                          <span>Security Tactical Components</span>
                        </h3>
                        <p className="panel-description">
                          Live personnel tagged by specialised Bandobusth security component
                        </p>
                      </div>
                      <span className="pill-tag">{policeTelemetry.securityComponents.length} Official Components</span>
                    </header>

                    <div className="security-components-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                      {policeTelemetry.securityComponents.map((item) => (
                        <article className="security-component-card" key={item.component}>
                          <div className="component-card-top">
                            <h4 className="component-card-title">{item.component}</h4>
                            <span className="component-count-badge">
                              {number(item.assignedCount)} / {number(item.totalPersonnel)}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.zonesCovered.length > 0
                              ? `Zones: ${item.zonesCovered.join(', ')}`
                              : 'No personnel tagged to this component yet'}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* ================================================================ */}
            {/* CAMPUS & AGENCIES PASS OPERATIONS MODULE (Live DB)               */}
            {/* ================================================================ */}
            {(domain === 'all' || domain === 'campus') && (
              <>
                <div className="charts-grid" id="campus-charts">
                  <section className="operations-panel" aria-label="Creation trend">
                    <header className="panel-heading">
                      <div>
                        <h2 className="panel-heading-title">
                          <TrendingUp size={18} className="crimson-icon" aria-hidden="true" />
                          <span>Pass Creation Velocity</span>
                        </h2>
                        <p className="panel-description">
                          Daily campus &amp; agency registrations in Asia/Kolkata (IST)
                        </p>
                      </div>
                      <span className="pill-tag">
                        {days === '0' ? 'All time' : `Last ${days} days`}
                      </span>
                    </header>

                    {data ? (
                      <CreationChart trend={data.trend} />
                    ) : (
                      <div className="chart-loading">
                        <Loader2 className="spinning" size={22} />
                        <span>Loading registration history…</span>
                      </div>
                    )}

                    <footer className="panel-mini-footer">
                      <span>Registration trajectory in IST</span>
                      <strong>{number(s?.today ?? 0)} created today</strong>
                    </footer>
                  </section>

                  <section className="operations-panel" id="production" aria-label="Print progress">
                    <header className="panel-heading">
                      <div>
                        <h2 className="panel-heading-title">
                          <Printer size={18} className="crimson-icon" aria-hidden="true" />
                          <span>Print Progress</span>
                        </h2>
                        <p className="panel-description">Pipeline from registration to print</p>
                      </div>
                    </header>

                    <div className="gauge-wrapper">
                      <div
                        className="progress-donut"
                        style={{
                          background: `conic-gradient(#059669 ${percent(
                            s?.printed ?? 0,
                            s?.total ?? 0
                          )}%, #e2e8f0 0)`,
                        }}
                        role="progressbar"
                        aria-valuenow={percent(s?.printed ?? 0, s?.total ?? 0)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Overall print completion percentage"
                      >
                        <div className="progress-donut-inner">
                          <span className="progress-donut-percentage">
                            {percent(s?.printed ?? 0, s?.total ?? 0)}
                            <span>%</span>
                          </span>
                          <span className="progress-donut-label">Printed</span>
                        </div>
                      </div>
                    </div>

                    <div className="progress-legend-list">
                      <div className="progress-legend-row">
                        <div className="progress-legend-label">
                          <span className="legend-pill-dot emerald" />
                          <span>Printed passes</span>
                        </div>
                        <span className="progress-legend-val">{number(s?.printed ?? 0)}</span>
                      </div>
                      <div className="progress-legend-row">
                        <div className="progress-legend-label">
                          <span className="legend-pill-dot amber" />
                          <span>Ready to print</span>
                        </div>
                        <span className="progress-legend-val">{number(s?.ready ?? 0)}</span>
                      </div>
                      <div className="progress-legend-row">
                        <div className="progress-legend-label">
                          <span className="legend-pill-dot blue" />
                          <span>Issued</span>
                        </div>
                        <span className="progress-legend-val">{number(s?.issued ?? 0)}</span>
                      </div>
                      <div className="progress-legend-row">
                        <div className="progress-legend-label">
                          <span className="legend-pill-dot slate" />
                          <span>Draft / Pending</span>
                        </div>
                        <span className="progress-legend-val">{number(s?.pending ?? 0)}</span>
                      </div>
                    </div>

                    <footer className="panel-mini-footer">
                      <span>Verified badge print counts</span>
                      <strong>{number(s?.printRuns ?? 0)} total runs</strong>
                    </footer>
                  </section>
                </div>

                {/* Passes by Office (aligned with web/src/components/admin/OfficeStatsTable.tsx) */}
                <section className="operations-panel" id="offices" aria-labelledby="offices-heading">
                  <header className="panel-heading">
                    <div>
                      <h2 id="offices-heading" className="panel-heading-title">
                        <Building2 size={18} className="crimson-icon" aria-hidden="true" />
                        <span>Passes by Office</span>
                      </h2>
                      <p className="panel-description">
                        Subdivision police offices and District Head Office allocation
                      </p>
                    </div>
                    <span className="pill-tag">
                      {number(data?.offices.filter((o) => o.id !== 'unassigned').length ?? 0)} Offices
                    </span>
                  </header>

                  <div tabIndex={0} role="region" aria-labelledby="offices-heading" className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Office</th>
                          <th scope="col" className="numeric">Total</th>
                          <th scope="col" className="numeric">Pending</th>
                          <th scope="col" className="numeric">Ready to print</th>
                          <th scope="col" className="numeric">Printed</th>
                          <th scope="col" className="numeric">Issued</th>
                          <th scope="col" className="numeric">Revoked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.offices
                          .filter((office) => office.id !== 'unassigned')
                          .map((office) => (
                            <tr key={office.id}>
                              <th scope="row">
                                <strong>{office.name}</strong>
                              </th>
                              <td className="numeric">
                                <strong>{number(office.total)}</strong>
                              </td>
                              <td className="numeric">{number(office.pending)}</td>
                              <td className="numeric">
                                <span className={`table-pill-chip ${office.ready > 0 ? 'amber' : 'slate'}`}>
                                  {number(office.ready)}
                                </span>
                              </td>
                              <td className="numeric">
                                <span className="table-pill-chip emerald">{number(office.printed)}</span>
                              </td>
                              <td className="numeric">
                                <span className="table-pill-chip blue">{number(office.issued)}</span>
                              </td>
                              <td className="numeric">
                                {office.revoked > 0 ? (
                                  <span className="table-pill-chip ruby">{number(office.revoked)}</span>
                                ) : (
                                  number(office.revoked)
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <footer className="panel-mini-footer">
                    <span>Real-time office-level issuance and print queue status</span>
                    <strong>District Operations Unit</strong>
                  </footer>
                </section>

                {/* Institutions & Venues */}
                <section className="operations-panel" id="institutions" aria-labelledby="institutions-heading">
                  <header className="panel-heading">
                    <div>
                      <h2 id="institutions-heading" className="panel-heading-title">
                        <Layers3 size={18} className="crimson-icon" aria-hidden="true" />
                        <span>Institutions &amp; Venues</span>
                      </h2>
                      <p className="panel-description">
                        Pass distribution and production completion across IISER, IIT, ICI and external agencies
                      </p>
                    </div>
                    <span className="pill-tag">
                      {number(data?.institutions.length ?? 0)} Active Institutions
                    </span>
                  </header>

                  <div tabIndex={0} role="region" aria-labelledby="institutions-heading" className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Institution</th>
                          <th scope="col" className="numeric">Passes created</th>
                          <th scope="col" className="numeric">Printed</th>
                          <th scope="col" className="numeric">Ready to print</th>
                          <th scope="col">Completion</th>
                          <th scope="col" className="numeric">Share of total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          'IISER',
                          'IIT',
                          'ICI',
                          ...(data?.institutions
                            .filter((r) => !['IISER', 'IIT', 'ICI', 'ICU'].includes(r.name))
                            .map((r) => r.name) ?? []),
                        ].map((name, i) => {
                          const row = data?.institutions.find((r) => r.name === name);
                          const fallbackRow =
                            name === 'ICI' ? data?.institutions.find((r) => r.name === 'ICU') : undefined;
                          const rowTotal = (row?.total ?? 0) + (fallbackRow?.total ?? 0);
                          const rowPrinted = (row?.printed ?? 0) + (fallbackRow?.printed ?? 0);
                          const rowReady = (row?.ready ?? 0) + (fallbackRow?.ready ?? 0);
                          const rate = percent(rowPrinted, rowTotal);
                          const toneClasses = ['metric-tone-blue', 'metric-tone-purple', 'metric-tone-rose', 'metric-tone-navy'];

                          return (
                            <tr key={name}>
                              <th scope="row">
                                <div className="institution-cell">
                                  <div className={`institution-avatar ${toneClasses[i % toneClasses.length]}`}>
                                    <Building2 size={16} aria-hidden="true" />
                                  </div>
                                  <div className="institution-title-wrap">
                                    <strong>{name === 'OTHER' ? 'External agencies / Other' : name}</strong>
                                    <small>
                                      {name === 'IISER'
                                        ? 'IISER Tirupati — Science Education & Research'
                                        : name === 'IIT'
                                        ? 'IIT Tirupati — Institute of Technology'
                                        : name === 'ICI' || name === 'ICU'
                                        ? 'Indian Culinary Institute'
                                        : 'External agencies & support services'}
                                    </small>
                                  </div>
                                </div>
                              </th>
                              <td className="numeric">
                                <strong>{data ? number(rowTotal) : '—'}</strong>
                              </td>
                              <td className="numeric">{number(rowPrinted)}</td>
                              <td className="numeric">
                                <span className={`table-pill-chip ${rowReady ? 'amber' : 'slate'}`}>
                                  {number(rowReady)}
                                </span>
                              </td>
                              <td>
                                <div className="completion-cell-wrap">
                                  <div className="completion-track">
                                    <div className="completion-bar-fill" style={{ width: `${rate}%` }} />
                                  </div>
                                  <span className="completion-percentage">{rate}%</span>
                                </div>
                              </td>
                              <td className="numeric">{percent(rowTotal, s?.total ?? 0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <footer className="panel-mini-footer">
                    <span>
                      <CircleHelp size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                      Assignments correspond to institution affiliation recorded on each campus pass.
                    </span>
                    <strong>{number(s?.total ?? 0)} campus passes</strong>
                  </footer>
                </section>

                {/* Breakdowns Grid */}
                <div className="breakdown-grid" id="breakdown">
                  <section className="operations-panel" aria-label="Personnel categories">
                    <header className="panel-heading">
                      <div>
                        <h2 className="panel-heading-title">
                          <Users size={17} className="crimson-icon" aria-hidden="true" />
                          <span>Personnel Categories</span>
                        </h2>
                        <p className="panel-description">Recipient classification</p>
                      </div>
                    </header>
                    <Distribution data={data?.categories ?? []} total={s?.total ?? 0} />
                    <footer className="panel-mini-footer">
                      <span>
                        Internal: <strong>{number(s?.internal ?? 0)}</strong>
                      </span>
                      <span>
                        External: <strong>{number(s?.external ?? 0)}</strong>
                      </span>
                    </footer>
                  </section>

                  <section className="operations-panel" aria-label="Pass status">
                    <header className="panel-heading">
                      <div>
                        <h2 className="panel-heading-title">
                          <BarChart3 size={17} className="crimson-icon" aria-hidden="true" />
                          <span>Pass Status</span>
                        </h2>
                        <p className="panel-description">Current registry states</p>
                      </div>
                    </header>
                    <Distribution
                      data={(data?.statuses ?? []).map((r) => ({
                        name: STATUS_LABELS[r.name] || r.name,
                        total: r.total,
                        printed: 0,
                        ready: 0,
                      }))}
                      total={s?.total ?? 0}
                    />
                    <footer className="panel-mini-footer">
                      <span>
                        Issued: <strong>{number(s?.issued ?? 0)}</strong>
                      </span>
                      <span>
                        Revoked: <strong>{number(s?.revoked ?? 0)}</strong>
                      </span>
                    </footer>
                  </section>

                  <section className="operations-panel" aria-label="Department mix">
                    <header className="panel-heading">
                      <div>
                        <h2 className="panel-heading-title">
                          <Building2 size={17} className="crimson-icon" aria-hidden="true" />
                          <span>Department Mix</span>
                        </h2>
                        <p className="panel-description">Top departments by pass count</p>
                      </div>
                    </header>
                    <Distribution data={data?.departments ?? []} total={s?.total ?? 0} />
                    <footer className="panel-mini-footer">
                      <span>
                        Print runs: <strong>{number(s?.printRuns ?? 0)}</strong>
                      </span>
                      <span>
                        Reprints: <strong>{number(s?.reprints ?? 0)}</strong>
                      </span>
                    </footer>
                  </section>
                </div>

                {/* Access Zone Coverage Strip aligned with web/src/core/domain/zones.ts */}
                <section className="zone-strip" id="zones" aria-label="Access zone coverage">
                  <div className="zone-strip-left">
                    <div className="zone-shield-icon">
                      <ShieldCheck size={24} aria-hidden="true" />
                    </div>
                    <div className="zone-strip-text">
                      <strong>Access Zone Security Clearance</strong>
                      <p>Campus passes may be multi-endorsed across Zones A, B and C.</p>
                    </div>
                  </div>

                  <div className="zone-pill-cards">
                    {CAMPUS_ACCESS_ZONES.map((zone) => {
                      const val =
                        zone.key === 'A'
                          ? s?.zoneA ?? 0
                          : zone.key === 'B'
                          ? s?.zoneB ?? 0
                          : s?.zoneC ?? 0;
                      return (
                        <div className="zone-card" key={zone.key}>
                          <div className="zone-card-meta">
                            <span className="zone-card-label">{zone.badgeTitle}</span>
                            <span className="zone-card-sub">{zone.subtitle}</span>
                          </div>
                          <span className="zone-card-val">{number(val)}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            <p className="definitions-text">
              Creation dates reflect Asia/Kolkata (IST) registry records. Printed counts include passes
              with recorded print runs or verified PRINTED/ISSUED status. Campus &amp; Agencies metrics
              reflect campus &amp; agency passes, while Police Force metrics reflect live Bandobusth force
              registry records alongside official 2026 scheme allocations (6,540 target strength).
            </p>
          </div>
        </main>
      </div>

      {/* Institutional Dark Navy Footer matching web/src/app/page.tsx */}
      <footer className="web-footer">
        <div className="web-footer-inner">
          <div className="footer-connection" role="status">
            <span className={`footer-connection-dot ${error ? 'offline' : ''}`} />
            <span>{error ? 'Telemetry offline' : 'Aggregate telemetry online · Auto-refreshes every 60s'}</span>
          </div>
          <div>61st All India DGPs / IGPs Conference · 2026</div>
          <div>Official Andhra Pradesh Police Pass Protocol</div>
        </div>
      </footer>
    </div>
  );
}
