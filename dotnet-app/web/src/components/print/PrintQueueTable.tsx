'use client';

import React from 'react';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { CollectionFeedback, CollectionPagination } from '../common/CollectionFeedback';
import { PillButton } from '../common/PillButton';
import {
  Printer,
  CheckCircle2,
  Clock,
  Layers,
  Search,
  RotateCw,
  Plus,
  Edit3,
} from 'lucide-react';
import { InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';

interface PrintQueueTableProps {
  passes: PassEntity[];
  loading: boolean;
  error?: string | null;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  institutionFilter?: InstitutionType;
  onInstitutionFilterChange: (inst?: InstitutionType) => void;
  categoryFilter?: CategoryType;
  onCategoryFilterChange: (cat?: CategoryType) => void;
  statusTab: 'ALL' | 'READY_TO_PRINT' | 'PENDING_APPROVAL' | 'PRINTED';
  onStatusTabChange: (tab: 'ALL' | 'READY_TO_PRINT' | 'PENDING_APPROVAL' | 'PRINTED') => void;
  search: string;
  onSearchChange: (search: string) => void;
  onPrintSingle: (pass: PassEntity) => void;
  onTriggerBatchPrint: () => void;
  onOpenSubmitModal: () => void;
  onEditPass?: (pass: PassEntity) => void;
  onRefresh: () => void;
}

export const PrintQueueTable: React.FC<PrintQueueTableProps> = ({
  passes,
  loading, error, total, page, pageSize, onPageChange, onClearFilters,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  institutionFilter,
  onInstitutionFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  statusTab,
  onStatusTabChange,
  search,
  onSearchChange,
  onPrintSingle,
  onTriggerBatchPrint,
  onOpenSubmitModal,
  onEditPass,
  onRefresh,
}) => {
  // Only ready to print passes can be batch selected
  const printablePasses = passes.filter((p) => p.status === 'READY_TO_PRINT' || p.status === 'PRINTED');
  const isAllSelected = printablePasses.length > 0 && printablePasses.every(pass => selectedIds.includes(pass.id));
  const hasFilters = Boolean(search || institutionFilter || categoryFilter);

  return (
    <section aria-labelledby="queue-title" className="data-panel space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {/* Top Banner for ID Print Team */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h3 id="queue-title" className="text-base font-semibold text-[#0B2545] flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#8B1A1A]" />
            <span>Production queue</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Official 9cm × 12cm duty passes, from submission to issue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Print Team Add Details Button */}
          <PillButton
            variant="crimson"
            size="sm"
            onClick={onOpenSubmitModal}
            icon={<Plus className="w-4 h-4" />}
          >
            Submit New Pass
          </PillButton>

          {selectedIds.length > 0 && (
            <PillButton
              variant="crimson"
              size="sm"
              onClick={onTriggerBatchPrint}
              icon={<Layers className="w-3.5 h-3.5" />}
            >
              Batch Print Selected ({selectedIds.length})
            </PillButton>
          )}

          <PillButton
            variant="outline"
            size="sm"
            onClick={onRefresh}
            icon={<RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </PillButton>
        </div>
      </div>

      {/* Production Queue Status Tabs */}
      <div className="queue-tabs flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4" aria-label="Queue status">
        <button
          type="button"
          aria-pressed={statusTab === 'READY_TO_PRINT'}
          onClick={() => onStatusTabChange('READY_TO_PRINT')}
          className={`min-h-10 px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            statusTab === 'READY_TO_PRINT'
              ? 'bg-[#8B1A1A] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Ready for Print</span>
        </button>

        <button
          type="button"
          aria-pressed={statusTab === 'PENDING_APPROVAL'}
          onClick={() => onStatusTabChange('PENDING_APPROVAL')}
          className={`min-h-10 px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            statusTab === 'PENDING_APPROVAL'
              ? 'bg-purple-800 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Awaiting Approval</span>
        </button>

        <button
          type="button"
          aria-pressed={statusTab === 'PRINTED'}
          onClick={() => onStatusTabChange('PRINTED')}
          className={`min-h-10 px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            statusTab === 'PRINTED'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Printed</span>
        </button>

        <button
          type="button"
          aria-pressed={statusTab === 'ALL'}
          onClick={() => onStatusTabChange('ALL')}
          className={`min-h-10 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
            statusTab === 'ALL'
              ? 'bg-[#0B2545] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All Entries
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px] sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search print queue"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, pass ID, department…"
            className="w-full min-h-11 pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] bg-slate-50 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by institution"
            value={institutionFilter || ''}
            onChange={(e) => onInstitutionFilterChange((e.target.value as InstitutionType) || undefined)}
            className="min-h-11 min-w-0 max-w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white"
          >
            <option value="">All Units &amp; Agencies</option>
            <option value="IISER">IISER Tirupati</option>
            <option value="IIT">IIT Tirupati</option>
            <option value="ICI">ICI: Indian Culinary Institute</option>
            <option value="Other">External Agencies</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter || ''}
            onChange={(e) => onCategoryFilterChange((e.target.value as CategoryType) || undefined)}
            className="min-h-11 min-w-0 max-w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white"
          >
            <option value="">All Categories</option>
            <option value="Student">Students</option>
            <option value="Faculty/Staff">Faculty &amp; Staff</option>
            <option value="Worker">Workers &amp; Maintenance</option>
            <option value="Other">Other Agencies</option>
          </select>
        </div>
      </div>

      {hasFilters && <div className="flex items-center justify-between text-[11px] text-slate-500"><span>Filtered queue results</span><button type="button" onClick={onClearFilters} className="min-h-8 rounded-lg px-2 font-semibold text-[#0B2545] hover:bg-slate-100">Clear filters</button></div>}

      {/* Batch Select Helper Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2">
          <input
            aria-label="Select all printable passes on this page"
            type="checkbox"
            checked={isAllSelected}
            onChange={() => (isAllSelected ? onDeselectAll() : onSelectAll())}
            disabled={printablePasses.length === 0}
            className="rounded accent-[#8B1A1A] cursor-pointer"
          />
          <span className="font-bold text-slate-800">
            {selectedIds.length > 0 ? `${selectedIds.length} approved cards selected` : 'Select printable cards on this page'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 font-medium text-slate-700">
            <Clock className="w-3.5 h-3.5" />
            On this page: {passes.length} record{passes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Queue Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="workspace-table w-full text-left text-xs" aria-busy={loading}>
          <caption className="sr-only">Print production queue</caption>
          <thead className="bg-[#8B1A1A] text-white">
            <tr>
              <th className="py-3 px-3.5 w-10"></th>
              <th className="py-3 px-3.5 font-bold">Pass ID</th>
              <th className="py-3 px-3.5 font-bold">Cardholder &amp; Classification</th>
              <th className="py-3 px-3.5 font-bold">Department / Agency</th>
              <th className="py-3 px-3.5 font-bold">Status</th>
              <th className="py-3 px-3.5 font-bold text-center">Print Runs</th>
              <th className="py-3 px-3.5 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading || error || passes.length === 0 ? (
              <tr><td colSpan={7}><CollectionFeedback loading={loading} error={error} onRetry={onRefresh} filtered={hasFilters} onClear={onClearFilters} /></td></tr>
            ) : (
              passes.map((pass) => {
                const isSelected = selectedIds.includes(pass.id);
                const isPending = pass.status === 'PENDING_APPROVAL';
                const isPrintable = pass.status === 'READY_TO_PRINT' || pass.status === 'PRINTED';

                return (
                  <tr
                    key={pass.id}
                    className={`transition hover:bg-slate-50/80 ${
                      isSelected ? 'bg-amber-50/50' : isPending ? 'bg-purple-50/40' : ''
                    }`}
                  >
                    {/* Checkbox (only for approved passes) */}
                    <td className="py-3 px-3.5">
                      <input
                        aria-label={`Select pass for ${pass.full_name}`}
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isPrintable}
                        onChange={() => onToggleSelect(pass.id)}
                        className="rounded accent-[#8B1A1A] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Pass Serial */}
                    <td className="py-3 px-3.5">
                      <span className="font-mono font-semibold text-[#0B2545] block text-xs">
                        {pass.pass_number}
                      </span>
                      <span className="font-mono text-[9px] text-[#8B1A1A] block">
                        {pass.verification_token}
                      </span>
                    </td>

                    {/* Cardholder & Unit */}
                    <td className="py-3 px-3.5">
                      <span className="font-semibold text-slate-900 block text-xs">
                        {pass.full_name}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {pass.personnel_type === 'EXTERNAL'
                          ? 'External Agency'
                          : pass.institution === 'ICU'
                          ? 'ICI'
                          : pass.institution}
                      </span>
                    </td>

                    {/* Department */}
                    <td className="py-3 px-3.5">
                      <span className="font-bold text-slate-800 text-[11px] block">
                        {pass.department}
                      </span>
                      <span className="text-[10px] text-slate-500">{pass.category}</span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3.5">
                      {isPending ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1 w-fit">
                          <Clock className="w-2.5 h-2.5" />
                          Awaiting Admin Approval
                        </span>
                      ) : pass.status === 'READY_TO_PRINT' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Approved &amp; Ready
                        </span>
                      ) : pass.status === 'PRINTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Printed
                        </span>
                      ) : <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">{pass.status.replaceAll('_', ' ')}</span>}
                    </td>

                    {/* Print Count */}
                    <td className="py-3 px-3.5 text-center">
                      <span className="font-mono font-bold text-slate-800">
                        {pass.printed_count || 0}
                      </span>
                      {pass.last_printed_at && (
                        <span className="block text-[8px] text-slate-400">
                          {new Date(pass.last_printed_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3.5 text-right">
                      {isPending ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {onEditPass && (
                            <PillButton
                              variant="outline"
                              size="sm"
                              onClick={() => onEditPass(pass)}
                              icon={<Edit3 className="w-3 h-3 text-[#0B2545]" />}
                              title="Edit Card Details (Waiting for Admin Approval)"
                            >
                              Edit
                            </PillButton>
                          )}
                          <span
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-block select-none"
                            title="Waiting for Admin approval before printing can commence"
                          >
                            Pending
                          </span>
                        </div>
                      ) : (
                        <PillButton
                          disabled={!isPrintable}
                          variant={pass.status === 'READY_TO_PRINT' ? 'crimson' : 'outline'}
                          size="sm"
                          onClick={() => onPrintSingle(pass)}
                          icon={<Printer className="w-3 h-3" />}
                        >
                          {pass.status === 'READY_TO_PRINT' ? 'Print Badge' : pass.status === 'PRINTED' ? 'Reprint' : 'Not queued'}
                        </PillButton>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <CollectionPagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} loading={loading} />
    </section>
  );
};
