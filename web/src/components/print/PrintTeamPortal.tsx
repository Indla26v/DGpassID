'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect } from 'react';
import { usePassCollection, useDebouncedValue } from '../common/usePassCollection';
import { PrintQueueTable } from './PrintQueueTable';
import { SingleCardPrintModal } from './SingleCardPrintModal';
import { BatchPrintModal } from './BatchPrintModal';
import { PrintTeamSubmitModal } from './PrintTeamSubmitModal';
import { PrintTeamEditModal } from './PrintTeamEditModal';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { InstitutionType, CategoryType } from '@/core/domain/types/pass-status.enum';
import { fetchPrintDetails } from '@/lib/print-details';
import { policePrintBlocker } from '@/core/domain/police-print';

export const PrintTeamPortal: React.FC<{ passType?: 'CAMPUS' | 'POLICE_FORCE'; embedded?: boolean }> = ({
  passType = 'CAMPUS',
  embedded = false,
}) => {
  const police = passType === 'POLICE_FORCE';
  const [policeBatch, setPoliceBatch] = useState<PassEntity[]>([]);
  const [batchNotice, setBatchNotice] = useState('');
  const [preparing, setPreparing] = useState(false);
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
  const params = new URLSearchParams({ status: statusTab, pass_type: passType });
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

  // Police badges need photo and duty details before batch printing.
  const openPoliceBatch = async () => {
    setPreparing(true);
    setBatchNotice('');
    try {
      const details = await fetchPrintDetails(selectedIds);
      const ready = details.filter(pass => !policePrintBlocker(pass));
      if (!ready.length) {
        setBatchNotice('The selected badges need a zone, sector and photograph before printing.');
        return;
      }
      if (ready.length < details.length) {
        setBatchNotice(`${details.length - ready.length} selected badge(s) skipped because their zone, sector or photograph is missing.`);
      }
      setPoliceBatch(ready);
    } catch (error) {
      setBatchNotice(error instanceof Error ? error.message : 'Could not prepare the batch.');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      {!embedded && <OperationsHeader title={police ? 'Police Print Queue' : 'Campus & Agencies Print Queue'}
        description={police ? 'Print and reprint police duty ID cards.' : 'Submit passes for approval and print or issue cleared cards.'} />}
      {batchNotice && <p role="status" className="text-sm text-amber-900">{batchNotice}</p>}
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
        onTriggerBatchPrint={police ? openPoliceBatch : () => setIsBatchOpen(true)}
        police={police}
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
      {police ? (policeBatch.length > 0 && (
        <BatchPrintModal police selectedPasses={policeBatch} isOpen notice={batchNotice}
          onClose={() => setPoliceBatch([])}
          onBatchPrinted={() => {
            setPoliceBatch([]);
            setBatchNotice('');
            setSelectedIds([]);
            fetchQueue();
          }} />
      )) : (
      <BatchPrintModal
        selectedPasses={selectedPasses}
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        onBatchPrinted={() => {
          setSelectedIds([]);
          fetchQueue();
        }}
      />
      )}
      {preparing && <p role="status" className="text-sm text-slate-600">Preparing the batch…</p>}
    </div>
  );
};
