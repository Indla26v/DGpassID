'use client';

import { useDialog } from '../common/useDialog';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PillButton } from '../common/PillButton';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { PrintablePoliceDutyCard } from '../badges/PrintablePoliceDutyCard';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { CAMPUS_PRINT_ZONE_REQUIRED, needsCampusPrintZone } from '@/core/domain/zones';
import { policePrintBlocker } from '@/core/domain/police-print';
import { X, Printer, Layers } from 'lucide-react';
import { openPrintDialog } from '@/lib/print-helper';
import { PrintOutcome } from './PrintOutcome';
import { usePrintOutcome } from './usePrintOutcome';
import { fetchPrintDetails } from '@/lib/print-details';

interface BatchPrintModalProps {
  selectedPasses: PassEntity[];
  isOpen: boolean;
  onClose: () => void;
  onBatchPrinted: (count: number) => void;
  police?: boolean;
  notice?: string;
}

export const BatchPrintModal: React.FC<BatchPrintModalProps> = ({
  selectedPasses,
  isOpen,
  onClose,
  onBatchPrinted,
  police = false,
  notice,
}) => {
  const [details, setDetails] = useState<{ selection: PassEntity[]; passes: PassEntity[] } | null>(null);
  const [detailsError, setDetailsError] = useState('');
  const [retry, setRetry] = useState(0);
  const printSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || police || selectedPasses.length === 0) return;
    const controller = new AbortController();
    setDetails(null);
    setDetailsError('');
    void fetchPrintDetails(selectedPasses.map(pass => pass.id), controller.signal)
      .then(passes => {
        if (!controller.signal.aborted) setDetails({ selection: selectedPasses, passes });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setDetailsError(error.message);
      });
    return () => controller.abort();
  }, [isOpen, police, selectedPasses, retry]);

  const loadedPasses = police ? selectedPasses : details?.selection === selectedPasses ? details.passes : [];
  const loadingDetails = !police && loadedPasses.length === 0 && !detailsError;
  const selection = { ids: selectedPasses.map(pass => pass.id) };
  const active = isOpen && selection.ids.length > 0;
  const unassigned = selectedPasses.find(needsCampusPrintZone) || loadedPasses.find(needsCampusPrintZone);
  const invalidPolice = police && loadedPasses.find(pass => policePrintBlocker(pass));
  const blocked = loadedPasses.length !== selectedPasses.length || Boolean(unassigned || invalidPolice);
  const outcome = usePrintOutcome<{ successCount: number }>(result => {
    onBatchPrinted(result.successCount);
    onClose();
  });
  const close = () => outcome.closeIfIdle(onClose);
  const dialogRef = useDialog(active, close);

  if (!isOpen || selectedPasses.length === 0) return null;
  const Badge = police ? PrintablePoliceDutyCard : PrintableDutyCard;

  async function printSheets() {
    const sheet = printSheetRef.current;
    if (!sheet) throw new Error('Could not prepare the print sheets.');
    if (police) await waitForPoliceImages(sheet);
    sheet.classList.add('print-only-container');
    try {
      await openPrintDialog();
    } finally {
      sheet.classList.remove('print-only-container');
    }
  }

  async function waitForPoliceImages(sheet: HTMLDivElement) {
    const deadline = Date.now() + 5000;
    while (sheet.querySelectorAll('img[alt="Verification QR code" i]').length < loadedPasses.length && Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    if (sheet.querySelectorAll('img[alt="Verification QR code" i]').length < loadedPasses.length) {
      throw new Error('One or more QR codes could not load. Try printing again.');
    }
    const imageResults = await Promise.allSettled([...sheet.querySelectorAll('img')].map(img => img.decode()));
    if (imageResults.some(result => result.status === 'rejected') ||
        [...sheet.querySelectorAll('[data-police-badge-photo] img')].length < loadedPasses.length) {
      throw new Error('One or more badge images could not load. Check the photographs before printing.');
    }
  }

  return (
    <>
    {!blocked && typeof document !== 'undefined' && createPortal(
      <div ref={printSheetRef} className="hidden">
        {loadedPasses.map(pass => (
          <div key={pass.id} className="bulk-print-page">
            {police
              ? <PrintablePoliceDutyCard pass={pass} hideShadow />
              : <PrintableDutyCard pass={pass} hideShadow printDate={outcome.printDate} />}
          </div>
        ))}
      </div>,
      document.body,
    )}
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Batch print station" tabIndex={-1} className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">

      <div className={`no-print flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${outcome.count !== null ? 'max-w-md' : 'max-w-2xl'}`}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-police-crimson px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">
                Batch print
              </h2>
              <p className="text-[11px] text-white/80">
                {selectedPasses.length} {selectedPasses.length === 1 ? 'badge' : 'badges'} · One per page
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={close}
            disabled={outcome.locked}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {outcome.count !== null ? (
          <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
            <PrintOutcome count={outcome.count} saving={outcome.phase === 'saving'} error={outcome.error}
              onPrinted={outcome.confirm} onNotPrinted={outcome.dismiss} />
          </div>
        ) : (
        <>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {notice && <p role="status" className="px-1 text-sm text-slate-700">{notice}</p>}
            {loadingDetails && <p role="status" className="p-3 text-sm text-slate-600">Loading badge photos and signatures…</p>}
            {detailsError && (
              <div className="flex flex-wrap items-center gap-2 p-3">
                <p role="alert" className="text-sm text-rose-700">{detailsError}</p>
                <PillButton size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</PillButton>
              </div>
            )}
            <ul aria-label="Badges selected for printing" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
              {loadedPasses.map(pass => (
                <li key={pass.id} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-center">
                  <div className="w-full min-w-0">
                    <p className="truncate text-xs font-semibold text-police-navy" title={pass.full_name}>{pass.full_name}</p>
                    <p className="truncate font-mono text-[10px] text-slate-600">{pass.pass_number}</p>
                  </div>
                  <div style={{ zoom: 0.39 }}>
                    <Badge pass={pass} hideShadow />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3">
            {unassigned && <p role="status" className="text-sm text-amber-900">{unassigned.pass_number} · {CAMPUS_PRINT_ZONE_REQUIRED}</p>}
            {invalidPolice && <p role="status" className="text-sm text-amber-900">{invalidPolice.pass_number} · {policePrintBlocker(invalidPolice)}</p>}
            {outcome.error && <p role="alert" className="text-xs font-medium text-rose-700">{outcome.error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PillButton variant="secondary" size="sm" onClick={close} disabled={outcome.locked}>
                Cancel
              </PillButton>
              <PillButton
                variant="crimson"
                size="sm"
                onClick={() => outcome.start(selection, loadedPasses, printSheets)}
                disabled={outcome.locked || blocked}
                icon={<Printer className="w-4 h-4" />}
              >
                {outcome.locked ? 'Opening print dialog…' : selectedPasses.length === 1 ? 'Print badge' : `Print all ${selectedPasses.length} badges`}
              </PillButton>
            </div>
          </div>
        </>
        )}
      </div>
    </div>
    </>
  );
};
