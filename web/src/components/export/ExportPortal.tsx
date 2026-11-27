'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect, useCallback } from 'react';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { useAuth } from '@/auth/AuthProvider';
import { useToast } from '../common/Toast';
import { OFFICES, OfficeId, canAccessOffice, managesAccounts } from '@/core/domain/offices';
import {
  FileSpreadsheet,
  Download,
  Building2,
  Layers,
  Shield,
  Filter,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface DepartmentSummary {
  department: string;
  count: number;
}

interface OfficeStat {
  id: OfficeId | 'unassigned';
  name: string;
  total: number;
  pending: number;
  ready: number;
  printed: number;
  issued: number;
  revoked: number;
}

export const ExportPortal: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Filter states
  const [fullStatusFilter, setFullStatusFilter] = useState('ALL');
  const [deptSearch, setDeptSearch] = useState('');
  const [selectedDeptDropdown, setSelectedDeptDropdown] = useState('');

  // Data states
  const [officesStats, setOfficesStats] = useState<OfficeStat[]>([]);
  const [totalPasses, setTotalPasses] = useState(0);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchOfficeStats = useCallback(async (signal?: AbortSignal, retryCount = 0): Promise<void> => {
    if (retryCount === 0) setLoadingStats(true);
    try {
      const res = await fetch('/api/stats?include_registry_total=1', { cache: 'no-store', signal });
      if (!res.ok) {
        if (retryCount < 2 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 800));
          return fetchOfficeStats(signal, retryCount + 1);
        }
        return;
      }
      const data = await res.json();
      if (!signal?.aborted) {
        setOfficesStats(data.offices || []);
        setTotalPasses(data.registryTotal ?? 0);
      }
    } catch {
      if (!signal?.aborted && retryCount < 2) {
        await new Promise((r) => setTimeout(r, 800));
        return fetchOfficeStats(signal, retryCount + 1);
      }
    } finally {
      if (!signal?.aborted && (retryCount === 0 || retryCount >= 2)) {
        setLoadingStats(false);
      }
    }
  }, []);

  const fetchDepartments = useCallback(async (signal?: AbortSignal, retryCount = 0): Promise<void> => {
    if (retryCount === 0) setLoadingDepts(true);
    try {
      const res = await fetch('/api/passes/departments-summary', { cache: 'no-store', signal });
      if (!res.ok) {
        if (retryCount < 2 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 800));
          return fetchDepartments(signal, retryCount + 1);
        }
        return;
      }
      const data = await res.json();
      if (!signal?.aborted) {
        const list = Array.isArray(data?.departments) ? data.departments : [];
        setDepartments(list);
        if (list.length > 0 && !selectedDeptDropdown) {
          setSelectedDeptDropdown(list[0].department);
        }
      }
    } catch {
      if (!signal?.aborted && retryCount < 2) {
        await new Promise((r) => setTimeout(r, 800));
        return fetchDepartments(signal, retryCount + 1);
      }
    } finally {
      if (!signal?.aborted && (retryCount === 0 || retryCount >= 2)) {
        setLoadingDepts(false);
      }
    }
  }, [selectedDeptDropdown]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOfficeStats(controller.signal);
    void fetchDepartments(controller.signal);
    return () => controller.abort();
  }, [fetchOfficeStats, fetchDepartments]);

  const handleDownload = async (options: {
    type: 'full' | 'subdivision' | 'department';
    format?: 'csv' | 'pdf';
    officeId?: string;
    department?: string;
    status?: string;
    label: string;
  }) => {
    const format = options.format || 'csv';
    const downloadKey = `${options.type}-${format}-${options.officeId || ''}-${options.department || ''}`;
    setDownloading(downloadKey);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('type', options.type);
      params.set('format', format);
      if (options.officeId) params.set('office_id', options.officeId);
      if (options.department) params.set('department', options.department);
      if (options.status && options.status !== 'ALL') params.set('status', options.status);

      const res = await fetch(`/api/passes/export?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Export failed with HTTP status ${res.status}`);
      }

      const contentDisposition = res.headers.get('content-disposition');
      let filename = `passes-export.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/i);
        if (match?.[1]) filename = match[1];
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.download = filename;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(blobUrl);

      showToast(`Exported ${options.label} (${filename})`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAllSubdivisions = async (format: 'csv' | 'pdf' = 'csv') => {
    for (const off of officesStats) {
      if (canAccessOffice(user, off.id === 'unassigned' ? null : (off.id as OfficeId))) {
        await handleDownload({
          type: 'subdivision',
          format,
          officeId: off.id,
          label: `${off.name} (${format.toUpperCase()})`,
        });
      }
    }
  };

  const filteredDepartments = departments.filter((d) =>
    d.department.toLowerCase().includes(deptSearch.toLowerCase().trim())
  );

  const userOfficeName = user.officeId
    ? OFFICES.find((o) => o.id === user.officeId)?.name ?? user.officeId
    : 'District Head Office (All Subdivisions)';

  const isSuperAdminOrSp = managesAccounts(user);

  return (
    <div className="min-w-0 space-y-4 pb-4">
      <OperationsHeader title="Duty ID Card Data Export" description="Download CSV files or print-ready PDF lists for the full registry, subdivisions or departments.">
        <PillButton
          variant="outline"
          size="sm"
          disabled={loadingStats || loadingDepts}
          onClick={() => { void fetchOfficeStats(); void fetchDepartments(); }}
          icon={<RefreshCw aria-hidden="true" className={`size-3.5 ${loadingStats || loadingDepts ? 'motion-safe:animate-spin' : ''}`} />}
        >
          Refresh Metrics
        </PillButton>
      </OperationsHeader>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Jurisdiction Notice Card */}
      <div className="operations-panel operations-enter flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#0B2545]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Active Authorized Jurisdiction
            </p>
            <p className="text-sm font-bold text-[#0B2545]">{userOfficeName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium">
            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
            Total Passes: <strong className="text-slate-900">{totalPasses}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            Campus Departments: <strong className="text-slate-900">{departments.length}</strong>
          </span>
        </div>
      </div>

      {/* SECTION 1: Full Registry Export (Super Admin & District SP Only) */}
      {isSuperAdminOrSp && (
        <div className="operations-panel p-4 sm:p-5">
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-[#0B2545]">Full Registry Export</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Export all duty access passes within your authorized jurisdiction into a streamlined spreadsheet (CSV) or official printable police document (PDF). Includes full 12-digit Government IDs, clean validity dates, and authorized department allocations.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> UTF-8 BOM CSV
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 font-medium text-blue-700">
                  <CheckCircle2 className="h-3 w-3" /> A4 Landscape PDF
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
                  Excel &amp; Calc Ready
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 shrink-0 sm:flex-row sm:items-center">
              <CustomSelect
                ariaLabel="Filter by Pass Status"
                icon={<Filter className="h-3.5 w-3.5 text-slate-400" />}
                value={fullStatusFilter}
                onChange={setFullStatusFilter}
                options={[
                  { value: 'ALL', label: 'All Statuses', count: totalPasses },
                  { value: 'APPROVED', label: 'Approved Only' },
                  { value: 'READY_TO_PRINT', label: 'Ready to Print' },
                  { value: 'PRINTED', label: 'Printed Only' },
                  { value: 'ISSUED', label: 'Issued Passes' },
                  { value: 'REVOKED', label: 'Revoked / Rejected' },
                  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
                ]}
              />

              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  variant="crimson"
                  size="md"
                  icon={<Download className="h-4 w-4" />}
                  disabled={downloading !== null}
                  onClick={() =>
                    handleDownload({
                      type: 'full',
                      format: 'csv',
                      status: fullStatusFilter,
                      label: `Full Registry CSV (${fullStatusFilter})`,
                    })
                  }
                >
                  {downloading === `full-csv--` ? 'Generating CSV...' : 'Download CSV'}
                </PillButton>

                <PillButton
                  variant="primary"
                  size="md"
                  icon={<FileText className="h-4 w-4" />}
                  disabled={downloading !== null}
                  onClick={() =>
                    handleDownload({
                      type: 'full',
                      format: 'pdf',
                      status: fullStatusFilter,
                      label: `Full Registry PDF (${fullStatusFilter})`,
                    })
                  }
                >
                  {downloading === `full-pdf--` ? 'Generating PDF...' : 'Download PDF'}
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      <section aria-labelledby="subdivision-export-heading" className="operations-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h3 id="subdivision-export-heading" className="text-base font-semibold text-police-navy">Subdivision exports <span className="text-xs font-normal text-slate-600">· Campus &amp; Agencies</span></h3>
          {managesAccounts(user) && (
            <div className="flex flex-wrap items-center gap-2">
              <PillButton
                variant="crimson"
                size="sm"
                icon={<Layers className="h-3.5 w-3.5" />}
                disabled={downloading !== null || officesStats.length === 0}
                onClick={() => void handleDownloadAllSubdivisions('csv')}
              >
                Export All (CSV)
              </PillButton>
              <PillButton
                variant="primary"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                disabled={downloading !== null || officesStats.length === 0}
                onClick={() => void handleDownloadAllSubdivisions('pdf')}
              >
                Export All (PDF)
              </PillButton>
            </div>
          )}
        </div>

        <div role="region" aria-label="Subdivision export options" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Office</th>
                {['Total', 'Ready', 'Printed', 'Issued'].map(label => (
                  <th key={label} scope="col" className="px-2 py-2 text-right font-semibold">{label}</th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-semibold">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {officesStats.map(office => {
                const hasAccess = canAccessOffice(user, office.id === 'unassigned' ? null : office.id as OfficeId);
                return (
                  <tr key={office.id}>
                    <th scope="row" className="px-4 py-2 font-medium text-police-navy">{office.name}</th>
                    {[office.total, office.ready, office.printed, office.issued].map((value, index) => (
                      <td key={index} className="px-2 py-2 text-right tabular-nums text-slate-700">{value.toLocaleString()}</td>
                    ))}
                    <td className="px-4 py-2">
                      {hasAccess ? (
                        <div className="flex justify-end gap-2">
                          {(['csv', 'pdf'] as const).map(format => (
                            <PillButton key={format} variant={format === 'csv' ? 'crimson' : 'primary'} size="sm"
                              aria-label={`Download ${office.name} as ${format.toUpperCase()}`}
                              disabled={downloading !== null}
                              onClick={() => void handleDownload({
                                type: 'subdivision', format, officeId: office.id,
                                label: `${office.name} (${format.toUpperCase()})`,
                              })}>
                              {downloading === `subdivision-${format}-${office.id}-` ? '…' : format.toUpperCase()}
                            </PillButton>
                          ))}
                        </div>
                      ) : <p className="text-right text-xs text-slate-500">Restricted</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: Department Wise Export */}
      <div className="operations-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B2545] text-[11px] font-bold text-white">
                {isSuperAdminOrSp ? '3' : '2'}
              </span>
              <h3 className="text-lg font-bold text-[#0B2545]">Department Wise Export</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Download Campus &amp; Agencies pass lists by department.
            </p>
          </div>

          {/* Quick Dropdown Export */}
          {departments.length > 0 && (
            <div className="flex items-center gap-2">
              <CustomSelect
                ariaLabel="Select Department to Export"
                icon={<Building2 className="h-3.5 w-3.5 text-slate-400" />}
                value={selectedDeptDropdown}
                onChange={setSelectedDeptDropdown}
                searchable={true}
                placeholder="Choose Department"
                options={departments.map((d) => ({
                  value: d.department,
                  label: d.department,
                  count: d.count,
                }))}
              />

              <PillButton
                variant="crimson"
                size="sm"
                icon={<Download className="h-3.5 w-3.5" />}
                disabled={!selectedDeptDropdown || downloading !== null}
                onClick={() =>
                  handleDownload({
                    type: 'department',
                    format: 'csv',
                    department: selectedDeptDropdown,
                    label: `${selectedDeptDropdown} (CSV)`,
                  })
                }
              >
                CSV
              </PillButton>

              <PillButton
                variant="primary"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                disabled={!selectedDeptDropdown || downloading !== null}
                onClick={() =>
                  handleDownload({
                    type: 'department',
                    format: 'pdf',
                    department: selectedDeptDropdown,
                    label: `${selectedDeptDropdown} (PDF)`,
                  })
                }
              >
                PDF
              </PillButton>
            </div>
          )}
        </div>

        {/* Department Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search departments..."
            value={deptSearch}
            onChange={(e) => setDeptSearch(e.target.value)}
            className="operations-input pl-10 pr-4"
          />
          {deptSearch && (
            <button
              type="button"
              onClick={() => setDeptSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Departments Grid */}
        {loadingDepts ? (
          <div className="py-10 text-center text-xs text-slate-500">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-400" />
            Loading registered departments...
          </div>
        ) : filteredDepartments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">
            {deptSearch ? 'No departments matching your search.' : 'No pass records found with registered departments.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDepartments.map((dept) => {
              const isCsvBusy = downloading === `department-csv--${dept.department}`;
              const isPdfBusy = downloading === `department-pdf--${dept.department}`;

              return (
                <div
                  key={dept.department}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">
                        {dept.count} Pass{dept.count === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <p className="truncate text-xs font-bold text-[#0B2545] mt-0.5" title={dept.department}>
                      {dept.department}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <PillButton
                      variant="crimson"
                      size="sm"
                      icon={<Download className="h-3 w-3" />}
                      disabled={downloading !== null}
                      onClick={() =>
                        handleDownload({
                          type: 'department',
                          format: 'csv',
                          department: dept.department,
                          label: `${dept.department} (CSV)`,
                        })
                      }
                    >
                      {isCsvBusy ? '...' : 'CSV'}
                    </PillButton>

                    <PillButton
                      variant="primary"
                      size="sm"
                      icon={<FileText className="h-3 w-3" />}
                      disabled={downloading !== null}
                      onClick={() =>
                        handleDownload({
                          type: 'department',
                          format: 'pdf',
                          department: dept.department,
                          label: `${dept.department} (PDF)`,
                        })
                      }
                    >
                      {isPdfBusy ? '...' : 'PDF'}
                    </PillButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
