'use client';

import { OperationsHeader } from '../common/OperationsHeader';
import { PillButton } from '../common/PillButton';

import React, { useState, useEffect, useCallback } from 'react';
import { usePassCollection, useDebouncedValue } from '../common/usePassCollection';
import { CollectionFeedback } from '../common/CollectionFeedback';
import { CustomSelect } from '../common/CustomSelect';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { SingleCardPrintModal } from '../print/SingleCardPrintModal';
import { BatchPrintModal } from '../print/BatchPrintModal';
import { policePrintBlocker } from '@/core/domain/police-print';
import { fetchPrintDetails } from '@/lib/print-details';
import { useAuth } from '@/auth/AuthProvider';
import { PoliceOfficerEditModal } from './PoliceOfficerEditModal';
import { WaveImportCenter } from './WaveImportCenter';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { displayRank, RANK_GROUPS } from '@/core/domain/ranks';
import { managesAccounts } from '@/core/domain/offices';
import { OfficerSelectionPanel } from '../deployment/OfficerSelectionPanel';
import { PointAssignmentPortal } from '../deployment/PointAssignmentPortal';
import { PrintTeamPortal } from '../print/PrintTeamPortal';
import { PoliceExportPanel } from './PoliceExportPanel';
import { PoliceDashboard } from './PoliceDashboard';
import { InstructionsManager } from '../deployment/InstructionsManager';
import { SectionSidebar, type SidebarSection } from '../common/SectionSidebar';
import {
  ShieldCheck,
  Users,
  Printer,
  Upload,
  CheckCircle2,
  Clock,
  Search,
  Eye,
  Edit2,
  Shuffle,
  MapPinned,
  FileDown,
  LayoutDashboard,
  ClipboardList,
} from 'lucide-react';

interface PoliceStats {
  total: number;
  pendingDuty: number;
  dutyAssigned: number;
  printed: number;
  collected: number;
  districts: string[];
}

export const PoliceForcePortal: React.FC = () => {
  const { user } = useAuth();
  const isOperator = user.role === 'POLICE_PRINT';
  const isSp = user.role === 'ADMIN' && managesAccounts(user);
  type PoliceSection = 'dashboard' | 'selection' | 'import' | 'points' | 'instructions' | 'print' | 'export' | 'directory';
  const [activeTab, setActiveTab] = useState<PoliceSection>('directory');
  // Inner menu: SP sees every section; print operators only the force directory.
  const sections: SidebarSection<PoliceSection>[] = [
    ...(isSp ? [{ id: 'dashboard' as const, label: 'Dashboard', hint: 'Strength by zone, rank, district', Icon: LayoutDashboard }] : []),
    { id: 'directory', label: 'Bandobast Force', hint: 'Directory, print and issue', Icon: Users },
    ...(isSp ? [{ id: 'selection' as const, label: 'Officer Selection', hint: 'Pick and allot officers', Icon: Shuffle }] : []),
    ...(isSp ? [{ id: 'points' as const, label: 'Duty Points', hint: 'Sub-sectors and points', Icon: MapPinned }] : []),
    ...(isSp ? [{ id: 'instructions' as const, label: 'Instructions', hint: 'Send duty instructions to zones', Icon: ClipboardList }] : []),
    ...(isSp ? [{ id: 'print' as const, label: 'Print Queue', hint: 'Police ID cards', Icon: Printer }] : []),
    ...(!isOperator ? [{ id: 'import' as const, label: 'Import', hint: 'Roster upload', Icon: Upload }] : []),
    ...(isSp ? [{ id: 'export' as const, label: 'Export', hint: 'Filtered roster download', Icon: FileDown }] : []),
  ];
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);

  // Stats
  const [stats, setStats] = useState<PoliceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [activePrintPass, setActivePrintPass] = useState<PassEntity | null>(null);
  const [autoPrintDirect, setAutoPrintDirect] = useState(false);
  const [activeEditPass, setActiveEditPass] = useState<PassEntity | null>(null);
  const [batch, setBatch] = useState<PassEntity[]>([]);
  const [reprintCursor, setReprintCursor] = useState({ query: '', offset: 0 });
  const [nextReprintCursor, setNextReprintCursor] = useState<typeof reprintCursor | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [batchNotice, setBatchNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [issueTarget, setIssueTarget] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const debouncedSearch = useDebouncedValue(search);

  const params = new URLSearchParams({
    pass_type: 'POLICE_FORCE',
  });
  if (recentlyUpdated) params.set('sort', 'updated');
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (zoneFilter) params.set('police_zone', zoneFilter);
  if (sectorFilter) params.set('police_sector', sectorFilter);
  if (rankFilter) params.set('police_rank', rankFilter);
  if (districtFilter) params.set('police_district', districtFilter);
  if (statusFilter && statusFilter !== 'ALL') {
    if (statusFilter === 'COLLECTED') {
      params.set('distribution_status', 'COLLECTED');
    } else if (statusFilter === 'ASSIGNED') {
      params.set('distribution_status', 'ASSIGNED');
    } else if (statusFilter === 'PENDING') {
      params.set('distribution_status', 'PENDING_ASSIGNMENT');
    } else if (statusFilter === 'PRINTED') {
      params.set('status', 'PRINTED');
    } else if (statusFilter === 'READY_TO_PRINT') {
      params.set('status', 'READY_TO_PRINT');
    }
  }

  const { passes, loading, error, total, page, pageSize, setPage, refresh } = usePassCollection(
    '/api/passes',
    params.toString()
  );
  const batchOffset = statusFilter === 'PRINTED' && reprintCursor.query === params.toString() ? reprintCursor.offset : 0;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/police-force/stats', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const clearFilters = () => {
    setSearch('');
    setZoneFilter('');
    setSectorFilter('');
    setRankFilter('');
    setDistrictFilter('');
    setStatusFilter('');
  };

  const loadBatch = async () => {
    setLoadingBatch(true);
    setActionError('');
    setBatchNotice('');
    try {
      const query = new URLSearchParams(params);
      query.set('print_batch', '1');
      query.set('limit', '100');
      query.set('offset', String(batchOffset));
      const response = await fetch(`/api/passes?${query}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load the print batch.');
      const records: PassEntity[] = result.passes;
      const details = await fetchPrintDetails(records.map(pass => pass.id));
      const ready = details.filter(pass => !policePrintBlocker(pass));
      if (!ready.length) throw new Error(records.length
        ? 'The matching passes need a zone, sector or photograph before printing.'
        : 'No printable passes match this filter. Check print status, duty assignments and photographs.');
      setBatchNotice(`Badges ${batchOffset + 1}–${batchOffset + records.length} of ${result.total} matching printable passes.` +
        (ready.length < records.length ? ` ${records.length - ready.length} skipped because their assignment or photograph is incomplete.` : ''));
      setNextReprintCursor(statusFilter === 'PRINTED' && batchOffset + records.length < result.total
        ? { query: params.toString(), offset: batchOffset + records.length } : null);
      setBatch(ready);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not prepare the print batch.');
    } finally {
      setLoadingBatch(false);
    }
  };

  const issueBadge = async () => {
    if (!issueTarget) return;
    setIssuing(true);
    setActionError('');
    try {
      const response = await fetch(`/api/police-force/${issueTarget}/issue`, { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not issue the badge.');
      setIssueTarget(null);
      refresh();
      fetchStats();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not issue the badge.');
    } finally {
      setIssuing(false);
    }
  };

  const metrics = [
    { label: 'Total Personnel', value: stats?.total, icon: Users, tone: 'bg-slate-100 text-[#0B2545]' },
    { label: 'Duty assigned', value: stats?.dutyAssigned, icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-800' },
    { label: 'Duty pending', value: stats?.pendingDuty, icon: Clock, tone: 'bg-rose-50 text-rose-700' },
    { label: 'Passes printed', value: stats?.printed, icon: Printer, tone: 'bg-blue-50 text-blue-800' },
    { label: 'Handed over', value: stats?.collected, icon: CheckCircle2, tone: 'bg-indigo-50 text-indigo-800' },
  ];
  const scope = user.policePrintScope ?? [];
  const availableZones = POLICE_BANDOBUSHT_ZONES.filter(zone => !isOperator || scope.some(item => item.zone === zone.name));
  const zone = availableZones.find(item => item.name === zoneFilter);
  const sectors = zone?.sectors.filter(sector => !isOperator || scope.some(item =>
    item.zone === zone.name && (item.sector === null || item.sector === sector.number),
  )) ?? [];
  const filters = [
    { label: 'Zone', value: zoneFilter, onChange: (value: string) => { setZoneFilter(value); setSectorFilter(''); }, defaultLabel: 'All zones', options: availableZones.map((item) => ({ value: item.name, label: `Zone ${item.number}: ${item.name}` })) },
    { label: 'Sector', value: sectorFilter, onChange: setSectorFilter, disabled: !zone, defaultLabel: 'All sectors', options: sectors.map(item => ({ value: item.number, label: `${item.number} · ${item.name}` })) },
    { label: 'District / unit', value: districtFilter, onChange: setDistrictFilter, defaultLabel: 'All districts / units', searchable: true, options: (stats?.districts ?? []).map(district => ({ value: district, label: district })) },
    { label: 'Rank', value: rankFilter, onChange: setRankFilter, defaultLabel: 'All ranks', searchable: true, options: RANK_GROUPS.map(({ group, component }) => ({ value: group, label: component === 'AR' ? `${group} (AR)` : group })) },
    {
      label: 'Status',
      value: statusFilter,
      onChange: setStatusFilter,
      defaultLabel: 'All statuses',
      options: [
        { value: 'ASSIGNED', label: 'Duty assigned' },
        { value: 'PENDING', label: 'Pending assignment' },
        { value: 'READY_TO_PRINT', label: 'Ready to print' },
        { value: 'PRINTED', label: 'Printed' },
        { value: 'COLLECTED', label: 'Handed over' },
      ],
    },
  ];
  const hasFilters = Boolean(search || zoneFilter || sectorFilter || districtFilter || rankFilter || statusFilter);

  return (
    <div className="min-w-0 space-y-4">
      <OperationsHeader title="Police Bandobusth Force" description={isOperator ? 'Print and issue badges for your assigned zones and sectors.' : 'Personnel directory, duty assignments and pass distribution.'} />

      <dl aria-label="Police force activity" className="grid grid-cols-2 gap-2.5 min-[460px]:grid-cols-3 md:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="operations-metric">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-slate-600">{label}</dt>
              <dd className="mt-0.5 text-2xl font-semibold leading-none tabular-nums text-[#0B2545]">
                {value?.toLocaleString() ?? (statsLoading ? '…' : '—')}
              </dd>
            </div>
            <Icon aria-hidden="true" className={`size-7 shrink-0 rounded-full p-1.5 lg:size-8 ${tone}`} />
          </div>
        ))}
      </dl>

      <SectionSidebar title="Police Force" storageKey="section-menu" sections={sections} active={activeTab} onChange={setActiveTab} />
      <div>
      <div className="min-w-0 space-y-4">

      {!isOperator && activeTab === 'import' && (
        <WaveImportCenter
          onSuccess={() => {
            clearFilters();
            setPage(0);
            setRecentlyUpdated(true);
            fetchStats();
            refresh();
          }}
          onViewDirectory={() => setActiveTab('directory')}
        />
      )}

      {isSp && activeTab === 'dashboard' && <PoliceDashboard />}

      {isSp && activeTab === 'points' && <PointAssignmentPortal embedded />}

      {isSp && activeTab === 'instructions' && <InstructionsManager />}

      {isSp && activeTab === 'print' && <PrintTeamPortal passType="POLICE_FORCE" embedded />}

      {isSp && activeTab === 'export' && <PoliceExportPanel knownDistricts={stats?.districts ?? []} />}

      {isSp && activeTab === 'selection' && (
        <OfficerSelectionPanel knownDistricts={stats?.districts ?? []} onAllotted={() => { fetchStats(); refresh(); }} />
      )}

      {activeTab === 'directory' && (
        <section aria-label="Force directory" className="operations-panel operations-enter overflow-hidden">
          <div className="space-y-3 border-b border-slate-200 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Search police officers</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, ID, rank, mobile or sector"
                  className="operations-input pl-9 pr-3"
                />
              </label>
              {hasFilters && (
                <PillButton type="button" variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={clearFilters}>
                  Clear filters
                </PillButton>
              )}
            </div>

            <div role="group" aria-label="Officer filters" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1.25fr_1.25fr_1.2fr_0.8fr_1fr]">
              {filters.map(({ label, value, onChange, defaultLabel, searchable, disabled, options }) => (
                <div key={label} className="min-w-0 space-y-1">
                  <span aria-hidden="true" className="block pl-2 text-xs font-semibold text-slate-600">{label}</span>
                  <CustomSelect
                    ariaLabel={label}
                    value={value}
                    onChange={onChange}
                    searchable={searchable}
                    disabled={disabled}
                    options={[{ value: '', label: defaultLabel }, ...options]}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <p className="text-xs text-slate-600">{statusFilter === 'PRINTED' ? 'Bulk print uses matching printed badges.' : 'Bulk print uses matching badges ready to print.'}</p>
            <PillButton variant="crimson" size="sm" disabled={loading || loadingBatch || search.trim() !== debouncedSearch || ['PENDING', 'COLLECTED'].includes(statusFilter)}
              icon={<Printer className="size-3.5" />} onClick={loadBatch}>
              {loadingBatch ? 'Preparing batch…' : batchOffset ? 'Bulk print next matching badges' : 'Bulk print filtered badges'}
            </PillButton>
            {batchOffset > 0 && <PillButton variant="outline" size="sm" disabled={loadingBatch}
              onClick={() => setReprintCursor({ query: '', offset: 0 })}>Start from first badge</PillButton>}
          </div>
          {actionError && <p role="alert" className="px-3 py-2 text-sm text-rose-800">{actionError}</p>}
          {batchNotice && <p role="status" className="px-3 py-2 text-sm text-rose-800">{batchNotice}</p>}
          <div role="region" aria-label="Officer records" tabIndex={0} className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8B1A1A]">
            <table className="w-full min-w-[670px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3">Pass &amp; Police ID</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3">Officer Details</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3">Unit / District</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3">Zone &amp; sector</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3">Duty status</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2.5 font-semibold xl:px-3">Print status</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold xl:px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                      Loading police force records…
                    </td>
                  </tr>
                ) : error ? (
                  <tr><td colSpan={7}><CollectionFeedback loading={false} error={error} onRetry={refresh} /></td></tr>
                ) : passes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                      No matching police officers found.
                    </td>
                  </tr>
                ) : (
                  passes.map((pass) => {
                    const isCollected =
                      pass.distribution_status === 'COLLECTED' || Boolean(pass.collected_by_officer);
                    const hasPrinted = pass.printed_count > 0 || Boolean(pass.last_printed_at) || pass.status === 'PRINTED';

                    return (
                      <tr key={pass.id} className="transition-colors duration-200 hover:bg-slate-50">
                        {/* Pass & Police ID */}
                        <td className="px-2 py-2.5 align-top xl:px-3">
                          <span className="block text-xs font-semibold tabular-nums text-[#0B2545]">
                            {pass.pass_number}
                          </span>
                          <span className="block text-xs tabular-nums text-slate-600">
                            ID: {pass.police_id_number || 'Pending'}
                          </span>
                        </td>

                        {/* Officer Details */}
                        <td className="px-2 py-2.5 align-top xl:px-3">
                          <span className="block font-semibold leading-snug text-slate-900">
                            {pass.full_name}
                          </span>
                          <span className="text-[11px] font-bold text-[#8B1A1A]">
                            {displayRank(pass.rank || pass.designation_or_trade) || 'PC'}
                          </span>
                          <span className="block text-xs tabular-nums text-slate-600">
                            {pass.mobile_number}
                          </span>
                        </td>

                        {/* Unit / District */}
                        <td className="px-2 py-2.5 align-top xl:px-3">
                          <span className="block text-xs font-medium text-slate-800">
                            {pass.police_unit_district?.trim() || pass.institution_other?.trim() || 'Tirupati'}
                          </span>
                        </td>

                        {/* Bandobusth Zone & Sector */}
                        <td className="px-2 py-2.5 align-top xl:px-3">
                          {pass.police_zone ? (
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-[#0B2545] block text-[11px]">
                                {pass.police_zone}
                              </span>
                              <span className="font-bold text-[#8B1A1A] block text-[10.5px]">
                                {pass.police_sector_number}{' '}
                                {pass.police_sector_name ? `· ${pass.police_sector_name}` : ''}
                              </span>
                              {pass.police_point_name && (
                                <span className="block text-[10.5px] text-slate-600">Point: {pass.police_point_name}</span>
                              )}
                              {pass.security_component && (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-[9.5px] font-bold text-slate-700">
                                  {pass.security_component}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                              Zone Unassigned
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-2 py-2.5 align-top xl:px-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isCollected
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : pass.police_zone
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {isCollected
                              ? 'Handed Over'
                              : pass.police_zone
                              ? 'Assigned'
                              : 'Pending Zone'}
                          </span>
                        </td>

                        <td className="px-2 py-2.5 align-top xl:px-3">
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${hasPrinted
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {hasPrinted ? 'Printed' : 'Not printed'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-2.5 align-top xl:px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAutoPrintDirect(false);
                                setActivePrintPass(pass);
                              }}
                              title="View duty badge" aria-label="View duty badge"
                              className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 operations-action border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span className="hidden xl:inline">View</span>
                            </button>

                            {!isOperator && <button
                              type="button"
                              onClick={() => setActiveEditPass(pass)}
                              title="Edit officer" aria-label="Edit officer"
                              className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 operations-action border border-slate-200 px-2 text-xs font-semibold text-police-navy hover:bg-slate-100"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                              <span className="hidden xl:inline">Edit</span>
                            </button>}

                            <button
                              type="button"
                              onClick={() => {
                                setAutoPrintDirect(true);
                                setActivePrintPass(pass);
                              }}
                              title="Print duty ID card"
                              aria-label="Print duty ID card"
                              className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 operations-action bg-police-crimson px-2 text-xs font-semibold text-white hover:bg-police-crimsonLight"
                            >
                              <Printer aria-hidden="true" className="size-3.5" />
                              <span className="hidden xl:inline">Print</span>
                            </button>
                            {!isCollected && pass.status === 'PRINTED' && pass.printed_count > 0 && (
                              issueTarget === pass.id ? (
                                <>
                                  <PillButton size="sm" variant="crimson" disabled={issuing} onClick={issueBadge}>Confirm issue</PillButton>
                                  <PillButton size="sm" variant="outline" disabled={issuing} onClick={() => setIssueTarget(null)}>Cancel</PillButton>
                                </>
                              ) : (
                                <PillButton size="sm" variant="outline" disabled={issuing} onClick={() => setIssueTarget(pass.id)}>Issue</PillButton>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs">
            <span className="text-slate-500 font-medium">
              Showing {passes.length} of {total.toLocaleString()} officers
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="operations-action min-h-8 border border-slate-200 px-2.5 font-semibold text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-600">Page {page + 1}</span>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage(page + 1)}
                className="operations-action min-h-8 border border-slate-200 px-2.5 font-semibold text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      </div>
      </div>

      {/* Print & View Preview Modal for Police Duty ID Card */}
      {activePrintPass && (
        <SingleCardPrintModal
          isOpen={!activeEditPass}
          pass={activePrintPass}
          autoPrint={autoPrintDirect}
          previewOnly={!autoPrintDirect}
          canEditPoliceAssignment={!isOperator}
          onEdit={isOperator ? undefined : (pass) => {
            setAutoPrintDirect(false);
            setActivePrintPass(pass);
            setActiveEditPass(pass);
          }}
          onClose={() => {
            setActivePrintPass(null);
            setAutoPrintDirect(false);
          }}
          onPrintCompleted={() => {
            setActivePrintPass(null);
            setAutoPrintDirect(false);
            fetchStats();
            refresh();
          }}
        />
      )}

      {batch.length > 0 && (
        <BatchPrintModal police selectedPasses={batch} isOpen notice={batchNotice} onClose={() => setBatch([])}
          onBatchPrinted={() => {
            setReprintCursor(nextReprintCursor ?? { query: '', offset: 0 });
            setBatchNotice('');
            refresh();
            fetchStats();
          }} />
      )}

      {/* Edit Police Officer Modal */}
      {activeEditPass && (
        <PoliceOfficerEditModal
          isOpen={Boolean(activeEditPass)}
          pass={activeEditPass}
          onClose={() => setActiveEditPass(null)}
          onDeleted={user.role === 'ADMIN' ? id => {
            setActivePrintPass(pass => pass?.id === id ? null : pass);
            refresh();
            fetchStats();
          } : undefined}
          onUpdated={(updated) => {
            setActivePrintPass((pass) => pass?.id === updated.id ? updated : pass);
            setActiveEditPass(null);
            fetchStats();
            refresh();
          }}
        />
      )}
    </div>
  );
};
