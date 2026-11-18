'use client';

import { useDialog } from '../common/useDialog';
import React, { useState } from 'react';
import { PillButton } from '../common/PillButton';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { X, Printer, Layers, CheckCircle } from 'lucide-react';

interface BatchPrintModalProps {
  selectedPasses: PassEntity[];
  isOpen: boolean;
  onClose: () => void;
  onBatchPrinted: (count: number) => void;
}

export const BatchPrintModal: React.FC<BatchPrintModalProps> = ({
  selectedPasses,
  isOpen,
  onClose,
  onBatchPrinted,
}) => {
  const dialogRef = useDialog(isOpen && selectedPasses.length > 0, onClose);
  const [operatorName, setOperatorName] = useState('ID Print Station 1');
  const [loading, setLoading] = useState(false);
  const [printError, setPrintError] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  if (!isOpen || selectedPasses.length === 0) return null;

  const handlePrintBatch = async () => {
    setPrintError('');
    setLoading(true);
    try {
      const response = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedPasses.map(item => item.id), preview: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to authorize printing.');
      window.print();
      setAwaitingConfirmation(true);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to authorize printing.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBatchPrinted = async () => {
    try {
      setPrintError('');
      setLoading(true);
      const ids = selectedPasses.map((p) => p.id);
      const res = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          operatorName,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Unable to record the print batch.');
      const data = await res.json();
      onBatchPrinted(data.successCount || ids.length);
      onClose();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Unable to record the print batch.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Batch print station" tabIndex={-1} className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      {/* Batch Print Isolation Container for physical print output */}
      <div className="print-only-container hidden print:block">
        <div className="grid grid-cols-2 gap-4">
          {selectedPasses.map((pass) => (
            <div key={pass.id} className="page-break-inside-avoid mb-6">
              <PrintableDutyCard pass={pass} hideShadow={true} />
            </div>
          ))}
        </div>
      </div>

      <div className="no-print bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#8B1A1A] text-white flex items-center justify-between border-b border-[#0B2545]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Batch Print Station ({selectedPasses.length} Cards Selected)
              </h2>
              <p className="text-[11px] text-white/80">
                Front Side Duty Badges Mass Production Layout
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Mode:</span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#0B2545] text-white">
                Front Side Badges (9cm × 12cm)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Operator:</span>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="px-3 py-1 text-xs rounded-full border border-slate-300 bg-white"
              />
            </div>
          </div>

          {/* Cards Grid Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-2 bg-slate-100 rounded-2xl max-h-[480px] overflow-y-auto">
            {selectedPasses.map((pass) => (
              <div key={pass.id} className="flex flex-col items-center p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                <span className="text-[10px] font-mono font-bold text-[#0B2545] mb-1 truncate w-full text-center">
                  {pass.pass_number} - {pass.full_name}
                </span>
                <div className="transform scale-[0.65] origin-top h-[230px]">
                  <PrintableDutyCard pass={pass} />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {printError && <p role="alert" className="text-xs font-medium text-rose-700">{printError}</p>}
              {awaitingConfirmation ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Print dialog opened for {selectedPasses.length} badges. Did the batch print successfully?</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <PillButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setAwaitingConfirmation(false)}
                  disabled={loading}
                >
                  Cancelled / Not Printed
                </PillButton>
                <PillButton
                  variant="secondary"
                  size="sm"
                  onClick={handlePrintBatch}
                  disabled={loading}
                  icon={<Printer className="w-3.5 h-3.5" />}
                >
                  Retry
                </PillButton>
                <PillButton
                  variant="crimson"
                  size="sm"
                  onClick={handleConfirmBatchPrinted}
                  disabled={loading}
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                >
                  {loading ? 'Recording...' : 'Yes, Confirm Batch Printed'}
                </PillButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-500 font-medium">
                Ready to print {selectedPasses.length} front-side cards with verified checksum QR tokens.
              </span>
              <div className="flex items-center gap-3">
                <PillButton variant="secondary" onClick={onClose}>
                  Cancel
                </PillButton>
                <PillButton
                  variant="crimson"
                  onClick={handlePrintBatch}
                  disabled={loading}
                  icon={<Printer className="w-4 h-4" />}
                >
                  {loading ? 'Printing...' : `Print All ${selectedPasses.length} Badges`}
                </PillButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
