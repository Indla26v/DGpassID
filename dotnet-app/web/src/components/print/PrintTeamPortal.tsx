'use client';

import React, { useState, useEffect } from 'react';
import { usePassCollection, useDebouncedValue } from '../common/usePassCollection';
import { ChevronRight, Printer, Clock, CheckCircle2 } from 'lucide-react';
import { PrintQueueTable } from './PrintQueueTable';
import { SingleCardPrintModal } from './SingleCardPrintModal';
import { BatchPrintModal } from './BatchPrintModal';
import { PrintTeamSubmitModal } from './PrintTeamSubmitModal';
import { PrintTeamEditModal } from './PrintTeamEditModal';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';

export const PrintTeamPortal: React.FC = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Status Tab Filter
  const [statusTab, setStatusTab] = useState<'ALL' | 'READY_TO_PRINT' | 'PENDING_APPROVAL' | 'PRINTED'>('READY_TO_PRINT');

  // Filters
  const [institutionFilter, setInstitutionFilter] = useState<InstitutionType | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Modals
  const [singlePrintPass, setSinglePrintPass] = useState<PassEntity | null>(null);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [editingPass, setEditingPass] = useState<PassEntity | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const params = new URLSearchParams({ status: statusTab });
  if (institutionFilter) params.set('institution', institutionFilter);
  if (categoryFilter) params.set('category', categoryFilter);
  if (debouncedSearch) params.set('search', debouncedSearch);
  const { passes: queue, loading, error, total, page, pageSize, setPage, refresh: fetchQueue } = usePassCollection('/api/print-queue', params.toString());
  useEffect(() => { setSelectedIds([]); }, [queue, loading]);
  const clearFilters = () => { setSearch(''); setInstitutionFilter(undefined); setCategoryFilter(undefined); };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(queue.filter(p => p.status === 'READY_TO_PRINT' || p.status === 'PRINTED').map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const selectedPasses = queue.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="portal-enter space-y-6">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500"><span>Conference workspace</span><ChevronRight className="h-3 w-3" /><span className="text-[#0B2545]">Print production</span></div>
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8B1A1A]">ID print team</p><h2 className="text-2xl font-semibold tracking-tight text-[#0B2545] sm:text-3xl">Print Production</h2><p className="mt-2 text-sm text-slate-500">Prepare, submit, and print official duty access cards.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[{ Icon: Clock, step: '01', title: 'Submit details', text: 'Send new passes for admin approval.' }, { Icon: CheckCircle2, step: '02', title: 'Receive clearance', text: 'Approved passes move into your queue.' }, { Icon: Printer, step: '03', title: 'Print & issue', text: 'Print individual cards or a selected batch.' }].map(({ Icon, step, title, text }) => <div key={step} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8B1A1A]/10 text-[#8B1A1A]"><Icon className="h-4 w-4" /></div><div><p className="text-xs font-semibold text-[#0B2545]"><span className="mr-2 font-mono text-slate-400">{step}</span>{title}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{text}</p></div></div>)}
        </div>
      </div>
      <PrintQueueTable
        passes={queue}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onClearFilters={clearFilters}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        institutionFilter={institutionFilter}
        onInstitutionFilterChange={setInstitutionFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        statusTab={statusTab}
        onStatusTabChange={setStatusTab}
        search={search}
        onSearchChange={setSearch}
        onPrintSingle={(p) => setSinglePrintPass(p)}
        onTriggerBatchPrint={() => setIsBatchOpen(true)}
        onOpenSubmitModal={() => setIsSubmitModalOpen(true)}
        onEditPass={(p) => setEditingPass(p)}
        onRefresh={fetchQueue}
      />

      {/* Print Team Submit Modal (creates passes with status PENDING_APPROVAL) */}
      <PrintTeamSubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitted={() => {
          setIsSubmitModalOpen(false);
          setStatusTab('PENDING_APPROVAL');
          fetchQueue();
        }}
      />

      {/* Print Team Edit Modal (Edits cards that are waiting for Admin approval) */}
      <PrintTeamEditModal
        pass={editingPass}
        isOpen={Boolean(editingPass)}
        onClose={() => setEditingPass(null)}
        onUpdated={() => {
          setEditingPass(null);
          fetchQueue();
        }}
      />

      {/* Single Print Modal (strictly front-side 9cm x 12cm) */}
      <SingleCardPrintModal
        pass={singlePrintPass}
        isOpen={Boolean(singlePrintPass)}
        onClose={() => setSinglePrintPass(null)}
        onPrintCompleted={() => {
          fetchQueue();
        }}
      />

      {/* Batch Print Modal */}
      <BatchPrintModal
        selectedPasses={selectedPasses}
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        onBatchPrinted={() => {
          setSelectedIds([]);
          fetchQueue();
        }}
      />
    </div>
  );
};
