'use client';

import { useDialog } from '../common/useDialog';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PillButton } from '../common/PillButton';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { printSingleBadge } from '@/lib/print-helper';
import { X, Printer, RotateCcw, CheckCircle } from 'lucide-react';

const CARD_WIDTH = 85 * 96 / 25.4;
const CARD_HEIGHT = 130 * 96 / 25.4;

interface SingleCardPrintModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onPrintCompleted: (pass: PassEntity) => void;
}

export const SingleCardPrintModal: React.FC<SingleCardPrintModalProps> = ({
  pass,
  isOpen,
  onClose,
  onPrintCompleted,
}) => {
  const dialogRef = useDialog(isOpen && Boolean(pass), onClose);
  const [zoomScale, setZoomScale] = useState<'fit' | 1>('fit');
  const [previewWidth, setPreviewWidth] = useState(0);
  const [operatorName, setOperatorName] = useState('ID Print Operator');
  const [loading, setLoading] = useState(false);
  const [printError, setPrintError] = useState('');
  const [reprintReason, setReprintReason] = useState('');
  const [showReprintDialog, setShowReprintDialog] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const printCardRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !pass || !previewViewportRef.current) return;
    const viewport = previewViewportRef.current;
    setZoomScale('fit');
    setAwaitingConfirmation(false);
    const updateWidth = () => setPreviewWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isOpen, pass?.id]);

  const previewScale = zoomScale === 'fit'
    ? Math.min(1, (previewWidth || CARD_WIDTH) / CARD_WIDTH)
    : zoomScale;

  if (!isOpen || !pass) return null;

  const handlePrint = async () => {
    setPrintError('');
    setLoading(true);
    try {
      const response = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pass.id, preview: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to authorize printing.');
      if (printCardRef.current) {
        printSingleBadge(printCardRef.current, `Duty_Pass_${pass.pass_number}`);
      } else {
        window.print();
      }
      setAwaitingConfirmation(true);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to authorize printing.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPrinted = async () => {
    // 2. Only record print action in database when operator confirms physical printing
    try {
      setPrintError('');
      setLoading(true);
      const res = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pass.id,
          operatorName,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Unable to record printing.');
      const updated = await res.json();
      onPrintCompleted(updated);
      onClose();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Unable to record printing.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPrint = () => {
    // User cancelled the print dialog or print did not occur; keep status as READY_TO_PRINT
    setAwaitingConfirmation(false);
  };

  const handleReprintSubmit = async () => {
    if (!reprintReason.trim()) return;
    try {
      setPrintError('');
      setLoading(true);
      const res = await fetch(`/api/passes/${pass.id}/reprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorName,
          reason: reprintReason.trim(),
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Unable to record printing.');
      const updated = await res.json();
      onPrintCompleted(updated);
      setShowReprintDialog(false);
      setReprintReason('');
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Unable to record the reprint.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Hidden unscaled card strictly for single-page printing */}
      <div
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '85mm',
          height: '130mm',
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div ref={printCardRef}>
          <PrintableDutyCard pass={pass} hideShadow={true} scale={1} />
        </div>
      </div>

      {/* Direct document.body print portal for native browser Ctrl+P */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="single-card-print-portal" className="hidden print:block">
            <PrintableDutyCard pass={pass} hideShadow={true} scale={1} />
          </div>,
          document.body
        )}

      {/* Screen UI Modal (strictly excluded from printing with no-print) */}
      {createPortal(
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Duty access card print station" tabIndex={-1} className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full min-w-0 max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-4 sm:px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between gap-3 border-b border-[#8B1A1A]">
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="w-8 h-8 shrink-0 rounded-full bg-[#8B1A1A] flex items-center justify-center">
                <Printer className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wide">
                  Duty Access Card Print Station
                </h2>
                <p className="text-[11px] text-slate-300 break-words">
                  Card Serial: {pass.pass_number} • Print Count: {pass.printed_count || 0}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="w-8 h-8 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="min-h-0 min-w-0 p-4 sm:p-6 overflow-y-auto overflow-x-hidden overscroll-contain grid grid-cols-1 md:grid-cols-12 gap-6 items-start flex-1" data-preview-scroll>
            {/* Card Preview Column */}
            <div className="min-w-0 md:col-span-7 flex flex-col items-center bg-slate-100/70 p-3 sm:p-5 rounded-2xl border border-slate-200">
              {/* Header info & Zoom Controls */}
              <div className="flex flex-wrap items-center justify-between w-full mb-3 text-xs">
                <span className="font-extrabold text-[#0B2545] uppercase tracking-wide text-[11px]">
                  Front Side Duty Pass (8.5cm × 13cm)
                </span>

                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span>Scale:</span>
                  <button
                    type="button"
                    aria-pressed={zoomScale === 'fit'}
                    onClick={() => setZoomScale('fit')}
                    className={`min-h-8 px-2 py-0.5 rounded-full font-semibold ${
                      zoomScale === 'fit' ? 'bg-[#0B2545] text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    aria-pressed={zoomScale === 1}
                    onClick={() => setZoomScale(1)}
                    className={`min-h-8 px-2 py-0.5 rounded-full font-semibold ${
                      zoomScale === 1 ? 'bg-[#0B2545] text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    100%
                  </button>
                </div>
              </div>

              {/* The Badge Interactive Preview */}
              <div ref={previewViewportRef} className="w-full min-w-0 max-w-full overflow-x-auto" role="region" aria-label="Badge preview" tabIndex={0}>
                <div className="relative mx-auto" style={{ width: CARD_WIDTH * previewScale, height: CARD_HEIGHT * previewScale }}>
                  <div className="absolute left-0 top-0" style={{ width: CARD_WIDTH, height: CARD_HEIGHT, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                    <PrintableDutyCard pass={pass} scale={1} />
                  </div>
                </div>
              </div>

              <div className="w-full text-center mt-3 text-[11px] font-bold text-slate-500">
                Single-page front print: 8.5 cm (W) × 13.0 cm (H)
              </div>
            </div>

            {/* Print Controls Column */}
            <div className="min-w-0 break-words md:col-span-5 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#0B2545]">
                  Cardholder Credentials
                </h3>
                <div className="text-xs space-y-1 text-slate-700">
                  <div>
                    <span className="font-bold text-slate-500">Name:</span> {pass.full_name}
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Department / Unit:</span> {pass.department}
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Category:</span> {pass.category}
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Mobile:</span> {pass.mobile_number}
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Govt ID:</span> {pass.govt_id_type} (
                    {pass.govt_id_number})
                  </div>
                </div>
              </div>

              {/* Operator Signature / Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Print Operator Identifier
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                />
              </div>

              {/* Print Instructions */}
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-[11px] leading-relaxed">
                <strong>Guaranteed 1-Page Letter Print:</strong> Pre-calibrated margins (0.5" top, 0.43" left, 2.47" right, 3.14" bottom) on Letter paper. Background graphics will render official badge seals.
              </div>

              {/* Actions */}
              {printError && <p role="alert" className="text-xs font-medium text-rose-700">{printError}</p>}
              {awaitingConfirmation ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                  <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Print dialog opened. Did the badge print successfully?</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    If you clicked Cancel on the print screen, select <strong>Cancelled / Not Printed</strong> to leave this pass in the queue without altering its status.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    <PillButton
                      variant="crimson"
                      size="sm"
                      onClick={handleConfirmPrinted}
                      disabled={loading}
                      icon={<CheckCircle className="w-3.5 h-3.5" />}
                      className="w-full justify-center"
                    >
                      {loading ? 'Recording...' : 'Yes, Confirm Badge Printed'}
                    </PillButton>

                    <div className="flex gap-2">
                      <PillButton
                        variant="secondary"
                        size="sm"
                        onClick={handleCancelPrint}
                        disabled={loading}
                        className="flex-1 justify-center"
                      >
                        Cancelled / Not Printed
                      </PillButton>

                      <PillButton
                        variant="secondary"
                        size="sm"
                        onClick={handlePrint}
                        disabled={loading}
                        icon={<Printer className="w-3.5 h-3.5" />}
                        className="justify-center"
                      >
                        Retry Print
                      </PillButton>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <PillButton
                    variant="crimson"
                    size="lg"
                    onClick={handlePrint}
                    disabled={loading}
                    icon={<Printer className="w-4 h-4" />}
                    className="w-full justify-center whitespace-normal"
                  >
                    {loading ? 'Processing...' : 'Print Front Duty Pass (1 Page)'}
                  </PillButton>

                  <button
                    type="button"
                    onClick={() => setShowReprintDialog(!showReprintDialog)}
                    className="w-full py-2 text-xs font-bold text-slate-600 hover:text-rose-700 flex items-center justify-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Issue Replacement / Reprint</span>
                  </button>
                </div>
              )}

              {showReprintDialog && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                  <span className="text-xs font-bold text-rose-800 block">
                    Log Card Replacement Reason
                  </span>
                  <input
                    type="text"
                    value={reprintReason}
                    onChange={(e) => setReprintReason(e.target.value)}
                    placeholder="e.g. Card damaged / lost badge..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-rose-300 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <PillButton
                      variant="danger"
                      size="sm"
                      onClick={handleReprintSubmit}
                      disabled={loading || !reprintReason.trim()}
                    >
                      Confirm Reprint
                    </PillButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>, document.body)}
    </>
  );
};
