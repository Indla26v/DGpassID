'use client';

import { OFFICES } from '@/core/domain/offices';
import React from 'react';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { CollectionFeedback, CollectionPagination } from '../common/CollectionFeedback';
import { PillButton } from '../common/PillButton';
import {
  Search,
  Printer,
  Edit2,
  Trash2,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Send,
  CheckCircle,
  XCircle,
  Layers,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PassStatus, InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';

interface PassTableProps {
  passes: PassEntity[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter?: PassStatus;
  onStatusFilterChange: (status?: PassStatus) => void;
  institutionFilter?: InstitutionType;
  onInstitutionFilterChange: (inst?: InstitutionType) => void;
  categoryFilter?: CategoryType;
  onCategoryFilterChange: (cat?: CategoryType) => void;
  onPrint: (pass: PassEntity) => void;
  onBatchPrint?: () => void;
  onEdit: (pass: PassEntity) => void;
  onPreview: (pass: PassEntity) => void;
  onQueueForPrint: (pass: PassEntity) => void;
  onApprove?: (pass: PassEntity) => void;
  onRevoke: (pass: PassEntity) => void;
  onDelete: (pass: PassEntity) => void;
}

export const PassTable: React.FC<PassTableProps> = ({
  passes,
  loading, error, onRefresh, total, page, pageSize, onPageChange, onClearFilters,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  institutionFilter,
  onInstitutionFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  onPrint,
  onBatchPrint,
  onEdit,
  onPreview,
  onQueueForPrint,
  onApprove,
  onRevoke,
  onDelete,
}) => {
  const isAllSelected = passes.length > 0 && passes.every(pass => selectedIds.includes(pass.id));
  const hasFilters = Boolean(search || statusFilter || institutionFilter || categoryFilter);

  const getStatusBadge = (status: PassStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            AWAITING APPROVAL
          </span>
        );
      case 'READY_TO_PRINT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            READY TO PRINT
          </span>
        );
      case 'PRINTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            PRINTED
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            APPROVED
          </span>
        );
      case 'REVOKED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            REVOKED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            DRAFT
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  const getInstitutionBadge = (inst: string) => {
    switch (inst) {
      case 'IISER':
        return 'bg-[#0B2545]/10 text-[#0B2545] border-[#0B2545]/30';
      case 'IIT':
        return 'bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/30';
      case 'ICU':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <section aria-labelledby="registry-title" className="data-panel space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="registry-title" className="text-base font-semibold text-[#0B2545]">Pass registry <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 align-middle text-[11px] font-medium text-slate-500">{total.toLocaleString()}</span></h3><p className="mt-1 text-xs text-slate-500">Review credentials and manage access in one place.</p></div>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5" />Search &amp; filter</span>
      </div>
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px] sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search pass registry"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, pass ID, department, mobile…"
            className="w-full min-h-11 pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545] bg-slate-50 focus:bg-white"
          />
        </div>

        {/* Filters */}
        <div className="filter-controls flex w-full flex-wrap items-center gap-2 lg:w-auto">
          {/* Status Filter */}
          <select
            aria-label="Filter by pass status"
            value={statusFilter || ''}
            onChange={(e) => onStatusFilterChange((e.target.value as PassStatus) || undefined)}
            className="min-h-11 min-w-0 max-w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          >
            <option value="">All Statuses</option>
            <option value="PENDING_APPROVAL">Awaiting Approval</option>
            <option value="READY_TO_PRINT">Ready to Print</option>
            <option value="PRINTED">Printed</option>
            <option value="APPROVED">Approved</option>
            <option value="REVOKED">Revoked</option>
            <option value="DRAFT">Draft</option>
          </select>

          {/* Institution Filter */}
          <select
            aria-label="Filter by institution"
            value={institutionFilter || ''}
            onChange={(e) => onInstitutionFilterChange((e.target.value as InstitutionType) || undefined)}
            className="min-h-11 min-w-0 max-w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          >
            <option value="">All Units &amp; Agencies</option>
            <option value="IISER">IISER Tirupati</option>
            <option value="IIT">IIT Tirupati</option>
            <option value="ICU">ICU Emergency</option>
            <option value="Other">External Agencies</option>
          </select>

          {/* Category Filter */}
          <select
            aria-label="Filter by category"
            value={categoryFilter || ''}
            onChange={(e) => onCategoryFilterChange((e.target.value as CategoryType) || undefined)}
            className="min-h-11 min-w-0 max-w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
          >
            <option value="">All Categories</option>
            <option value="Student">Student</option>
            <option value="Faculty/Staff">Faculty/Staff</option>
            <option value="Worker">Worker</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {hasFilters && <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>Filtered results</span>{statusFilter && <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-[#0B2545]">{statusFilter.replaceAll('_', ' ').toLowerCase()}</span>}{institutionFilter && <span className="rounded-md bg-slate-100 px-2 py-1">{institutionFilter}</span>}{categoryFilter && <span className="rounded-md bg-slate-100 px-2 py-1">{categoryFilter}</span>}<button type="button" onClick={onClearFilters} className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 font-semibold text-[#0B2545] hover:bg-slate-100"><X className="h-3 w-3" />Clear filters</button></div>}

      {/* Batch Selection Banner for Admin */}
      {selectedIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
            <Printer className="w-4 h-4 text-[#8B1A1A]" />
            <span>
              {selectedIds.length} Pass{selectedIds.length > 1 ? 'es' : ''} Selected for Admin Printing
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onDeselectAll && (
              <PillButton variant="secondary" size="sm" onClick={onDeselectAll}>
                Clear Selection
              </PillButton>
            )}

            {onBatchPrint && (
              <PillButton
                variant="crimson"
                size="sm"
                onClick={onBatchPrint}
                icon={<Layers className="w-3.5 h-3.5" />}
              >
                Batch Print Selected ({selectedIds.length})
              </PillButton>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="workspace-table w-full text-left text-xs" aria-busy={loading}>
          <caption className="sr-only">Security pass registry</caption>
          <thead className="bg-[#0B2545] text-white">
            <tr>
              {onToggleSelect && (
                <th className="py-3 px-3 text-center w-10">
                  <input
                    aria-label="Select all passes on this page"
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => {
                      if (e.target.checked && onSelectAll) onSelectAll();
                      else if (!e.target.checked && onDeselectAll) onDeselectAll();
                    }}
                    className="w-3.5 h-3.5 rounded text-[#8B1A1A] cursor-pointer"
                  />
                </th>
              )}
              <th className="py-3 px-3.5 font-bold">Pass ID / Token</th>
              <th className="py-3 px-3.5 font-bold">Cardholder &amp; Classification</th>
              <th className="py-3 px-3.5 font-bold">Department / Role</th>
              <th className="py-3 px-3.5 font-bold">Access Zones</th>
              <th className="py-3 px-3.5 font-bold">Status</th>
              <th className="py-3 px-3.5 font-bold text-center">Printed</th>
              <th className="py-3 px-3.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading || error || passes.length === 0 ? (
              <tr><td colSpan={onToggleSelect ? 8 : 7}><CollectionFeedback loading={loading} error={error} onRetry={onRefresh} filtered={hasFilters} onClear={onClearFilters} /></td></tr>
            ) : (
              passes.map((pass) => (
                <tr key={pass.id} className={`hover:bg-slate-50/80 transition ${selectedIds.includes(pass.id) ? 'bg-amber-50/50' : ''}`}>
                  {onToggleSelect && (
                    <td className="py-3 px-3 text-center">
                      <input
                        aria-label={`Select pass for ${pass.full_name}`}
                        type="checkbox"
                        checked={selectedIds.includes(pass.id)}
                        onChange={() => onToggleSelect(pass.id)}
                        className="w-3.5 h-3.5 rounded text-[#8B1A1A] cursor-pointer"
                      />
                    </td>
                  )}

                  {/* Pass ID & Serial Token */}
                  <td className="py-3 px-3.5">
                    <span className="font-mono font-semibold text-[#0B2545] block text-[11px]">
                      {pass.pass_number}
                    </span>
                    <span className="font-mono text-[9px] text-[#8B1A1A] block">
                      {pass.verification_token}
                    </span>
                  </td>

                  {/* Cardholder & Institution */}
                  <td className="py-3 px-3.5">
                    <span className="font-semibold text-slate-900 block text-xs">
                      {pass.full_name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getInstitutionBadge(
                          pass.institution
                        )}`}
                      >
                        {pass.institution === 'Other'
                          ? pass.institution_other || 'External'
                          : pass.institution}
                      </span>
                      <span className="text-[10px] text-slate-500">{pass.mobile_number}</span>
                    </div>
                  </td>

                  {/* Category & Department */}
                  <td className="py-3 px-3.5">
                    <span className="font-bold text-slate-800 block text-[11px]">
                      {pass.department}
                      {pass.office_id && <span className="block text-slate-500">{OFFICES.find(office => office.id === pass.office_id)?.name}</span>}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate max-w-[180px] block">
                      {pass.category}
                    </span>
                  </td>

                  {/* Access Zones */}
                  <td className="py-3 px-3.5">
                    <div className="flex flex-wrap gap-1">
                      {pass.zone_a && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Zone-A
                        </span>
                      )}
                      {pass.zone_b && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Zone-B
                        </span>
                      )}
                      {pass.zone_c && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Zone-C
                        </span>
                      )}
                      {!pass.zone_a && !pass.zone_b && !pass.zone_c && (
                        <span className="text-[10px] text-slate-400 italic">None</span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3.5">{getStatusBadge(pass.status)}</td>

                  {/* Printed Count */}
                  <td className="py-3 px-3.5 text-center">
                    <span className="font-mono font-bold text-slate-800">
                      {pass.printed_count || 0}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* One-click Approve button for Admin when pass is pending approval */}
                      {pass.status === 'PENDING_APPROVAL' && onApprove && (
                        <PillButton
                          variant="success"
                          size="sm"
                          onClick={() => onApprove(pass)}
                          icon={<CheckCircle className="w-3.5 h-3.5" />}
                        >
                          Approve
                        </PillButton>
                      )}

                      {/* Admin Direct Print Button (Guaranteed 1-Page Duty Badge) */}
                      <PillButton
                        variant="crimson"
                        size="sm"
                        onClick={() => onPrint(pass)}
                        icon={<Printer className="w-3 h-3" />}
                        title="Print Front Duty Pass (1 Page)"
                      >
                        Print
                      </PillButton>

                      <button
                        type="button"
                        onClick={() => onPreview(pass)}
                        title="View Print Preview"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#0B2545] transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {pass.status !== 'READY_TO_PRINT' &&
                        pass.status !== 'PRINTED' &&
                        pass.status !== 'PENDING_APPROVAL' && (
                          <button
                            type="button"
                            onClick={() => onQueueForPrint(pass)}
                            title="Queue for Print"
                            className="p-2 rounded-lg hover:bg-amber-50 text-amber-700 transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() => onEdit(pass)}
                        title="Edit Details"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {pass.status !== 'REVOKED' && (
                        <button
                          type="button"
                          onClick={() => onRevoke(pass)}
                          title="Revoke / Reject Pass"
                          className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 transition"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDelete(pass)}
                        title="Delete Record"
                        className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <CollectionPagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} loading={loading} />
    </section>
  );
};
