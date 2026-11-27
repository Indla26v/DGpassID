'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect, useCallback } from 'react';
import { usePassCollection, useDebouncedValue } from '../common/usePassCollection';
import { useAuth } from '@/auth/AuthProvider';
import { managesAccounts, OFFICES } from '@/core/domain/offices';
import { OfficeStatsTable } from './OfficeStatsTable';
import { StatsCards } from '../common/StatsCards';
import { PassTable } from './PassTable';
import { PassCreateModal } from './PassCreateModal';
import { PassEditModal } from './PassEditModal';
import { BulkZoneAssignmentModal } from './BulkZoneAssignmentModal';
import { AddDepartmentModal } from './AddDepartmentModal';
import { SingleCardPrintModal } from '../print/SingleCardPrintModal';
import { BatchPrintModal } from '../print/BatchPrintModal';
import { PillButton } from '../common/PillButton';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { PassStatistics } from '@/core/interfaces/pass-repository.interface';
import { PassStatus, InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';
import { Plus, Building2, Clock, RefreshCw } from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const { user } = useAuth();
  const [officeFilter, setOfficeFilter] = useState('');
  const [stats, setStats] = useState<PassStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PassStatus | undefined>(undefined);
  const [institutionFilter, setInstitutionFilter] = useState<InstitutionType | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | undefined>(undefined);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkZoneOpen, setIsBulkZoneOpen] = useState(false);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);
  const [editingPass, setEditingPass] = useState<PassEntity | null>(null);
  const [printRequest, setPrintRequest] = useState<{ pass: PassEntity; autoPrint: boolean } | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const params = new URLSearchParams({
    pass_type: 'CAMPUS',
  });
  if (officeFilter) params.set('office_id', officeFilter);
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (statusFilter) params.set('status', statusFilter);
  if (institutionFilter) params.set('institution', institutionFilter);
  if (categoryFilter) params.set('category', categoryFilter);
  const { passes, loading, error, total, page, pageSize, setPage, refresh: fetchPasses } = usePassCollection('/api/passes', params.toString());

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/stats', { cache: 'no-store', signal });
      if (!res.ok) throw new Error('Statistics unavailable');
      const data = await res.json();
      if (!signal?.aborted) { setStats(data); setStatsError(false); }
    } catch (err) {
      if (!signal?.aborted) setStatsError(true);
    } finally {
      if (!signal?.aborted) setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats]);

  useEffect(() => { setSelectedIds([]); }, [passes, loading]);

  const clearFilters = () => {
    setOfficeFilter(''); setSearch(''); setStatusFilter(undefined); setInstitutionFilter(undefined); setCategoryFilter(undefined);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(passes.map((p) => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const selectedPasses = passes.filter((p) => selectedIds.includes(p.id));

  const handleApprove = async (pass: PassEntity) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/passes/${pass.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'READY_TO_PRINT',
          operatorName: 'Security Administrator',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'The change could not be saved. Please try again.');
      if (res.ok) {
        fetchPasses();
        fetchStats();
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleQueueForPrint = async (pass: PassEntity) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/passes/${pass.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'READY_TO_PRINT',
          operatorName: 'Security Administrator',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'The change could not be saved. Please try again.');
      if (res.ok) {
        fetchPasses();
        fetchStats();
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleRevoke = async (pass: PassEntity) => {
    const confirm = window.confirm(
      `Are you sure you want to officially REVOKE / REJECT Pass ${pass.pass_number}?`
    );
    if (!confirm) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/passes/${pass.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REVOKED',
          operatorName: 'Security Administrator',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'The change could not be saved. Please try again.');
      if (res.ok) {
        fetchPasses();
        fetchStats();
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleDelete = async (pass: PassEntity) => {
    const confirm = window.confirm(
      `Permanently delete Pass record ${pass.pass_number}? This cannot be undone.`
    );
    if (!confirm) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/passes/${pass.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'The change could not be saved. Please try again.');
      if (res.ok) {
        fetchPasses();
        fetchStats();
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <OperationsHeader title="Campus & External Agencies" description="Manage duty ID cards for IISER, IIT, ICI, contractors and external agencies.">
        {managesAccounts(user) && (
          <PillButton variant="outline" size="sm" onClick={() => setIsAddDeptOpen(true)} icon={<Building2 aria-hidden="true" className="size-4" />}>
            Add Department
          </PillButton>
        )}
        <PillButton variant="crimson" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus aria-hidden="true" className="size-4" />}>
          Issue New Duty ID Card
        </PillButton>
        <PillButton
          variant="outline"
          size="sm"
          disabled={loading || statsLoading}
          onClick={() => { fetchPasses(); void fetchStats(); }}
          icon={<RefreshCw aria-hidden="true" className={`size-3.5 ${loading || statsLoading ? 'motion-safe:animate-spin' : ''}`} />}
        >
          Refresh data
        </PillButton>
      </OperationsHeader>

      {actionError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{actionError}<button type="button" onClick={() => setActionError(null)} className="font-semibold underline">Dismiss</button></div>}

      {/* Pending Approvals Notice Banner if Print Team has submitted entries */}
      {stats && !statsError && stats.pendingApproval > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-purple-200 text-purple-900 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-purple-950 block">
                {stats.pendingApproval} Pass Submission{stats.pendingApproval > 1 ? 's' : ''} Awaiting Security Authorization
              </span>
              <span className="text-purple-700">
                Review and approve pending passes to release them into their print queues.
              </span>
            </div>
          </div>

          <PillButton
            variant="primary"
            size="sm"
            onClick={() => setStatusFilter('PENDING_APPROVAL')}
          >
            View Pending Requests ({stats.pendingApproval})
          </PillButton>
        </div>
      )}

      {/* Live Conference Stats */}
      <StatsCards stats={stats} loading={statsLoading} error={statsError} activeStatus={statusFilter} onStatusChange={setStatusFilter} onRetry={() => void fetchStats()} />

      {stats?.offices?.length && !statsError ? (
        <OfficeStatsTable offices={stats.offices} activeOffice={officeFilter}
          onOfficeChange={managesAccounts(user) ? setOfficeFilter : undefined} />
      ) : null}
      {officeFilter && (
        <div className="flex items-center gap-3 text-sm">
          <span>Registry office: {OFFICES.find(office => office.id === officeFilter)?.name ?? 'Unassigned'}</span>
          <button type="button" className="underline" onClick={() => setOfficeFilter('')}>Show all offices</button>
        </div>
      )}

      {/* Main Registry Table with Multi-Select and Admin Printing */}
      <PassTable
        passes={passes}
        loading={loading}
        error={error}
        onRefresh={fetchPasses}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onClearFilters={clearFilters}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        institutionFilter={institutionFilter}
        onInstitutionFilterChange={setInstitutionFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        onPrint={(pass) => setPrintRequest({ pass, autoPrint: true })}
        onBatchPrint={() => setIsBatchPrintOpen(true)}
        onBulkAssignZones={() => setIsBulkZoneOpen(true)}
        onEdit={(p) => setEditingPass(p)}
        onPreview={(pass) => setPrintRequest({ pass, autoPrint: false })}
        onQueueForPrint={handleQueueForPrint}
        onApprove={handleApprove}
        onRevoke={handleRevoke}
        onDelete={handleDelete}
      />

      {/* Issue Pass Modal */}
      <PassCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          fetchPasses();
          fetchStats();
        }}
        onPrint={(newPass) => {
          fetchPasses();
          fetchStats();
          setPrintRequest({ pass: newPass, autoPrint: true });
        }}
      />

      {/* Edit Pass Modal */}
      <PassEditModal
        pass={editingPass}
        isOpen={Boolean(editingPass)}
        onClose={() => setEditingPass(null)}
        onUpdated={(updated) => {
          setPrintRequest((request) => request?.pass.id === updated.id ? { ...request, pass: updated } : request);
          fetchPasses();
          fetchStats();
        }}
      />

      {/* Bulk Security Zone Assignment Modal */}
      <BulkZoneAssignmentModal
        isOpen={isBulkZoneOpen}
        onClose={() => setIsBulkZoneOpen(false)}
        selectedIds={selectedIds}
        onComplete={() => {
          setSelectedIds([]);
          fetchPasses();
          fetchStats();
        }}
      />

      {/* Add Department / Role Modal */}
      <AddDepartmentModal
        isOpen={isAddDeptOpen}
        onClose={() => setIsAddDeptOpen(false)}
        onAdded={() => {
          fetchPasses();
          fetchStats();
        }}
      />

      {/* Admin Direct Single-Card Print Modal (Strictly 1 Page) */}
      <SingleCardPrintModal
        pass={printRequest?.pass ?? null}
        isOpen={Boolean(printRequest) && !editingPass}
        autoPrint={printRequest?.autoPrint}
        previewOnly={!printRequest?.autoPrint}
        onClose={() => setPrintRequest(null)}
        onEdit={(pass) => {
          setPrintRequest({ pass, autoPrint: false });
          setEditingPass(pass);
        }}
        onPrintCompleted={() => {
          fetchPasses();
          fetchStats();
        }}
      />

      {/* Admin Batch Print Modal */}
      <BatchPrintModal
        selectedPasses={selectedPasses}
        isOpen={isBatchPrintOpen}
        onClose={() => setIsBatchPrintOpen(false)}
        onBatchPrinted={() => {
          setSelectedIds([]);
          fetchPasses();
          fetchStats();
        }}
      />
    </div>
  );
};
