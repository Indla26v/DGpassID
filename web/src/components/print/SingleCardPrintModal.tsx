'use client';

import { useDialog } from '../common/useDialog';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PillButton } from '../common/PillButton';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { PrintablePoliceDutyCard } from '../badges/PrintablePoliceDutyCard';
import { PoliceBandobusthSelector } from '../common/PoliceBandobusthSelector';
import { CameraCaptureModal } from '../common/CameraCaptureModal';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { printSingleBadge } from '@/lib/print-helper';
import { cleanMobileNumber, cleanAadhaarNumber, isValidPhotoUrl } from '@/lib/identity-validation';
import { canPrintPassStatus, policePrintBlocker } from '@/core/domain/police-print';
import { PASS_VALID_TO_LABEL } from '@/core/domain/pass-validity';
import {
  X,
  Printer,
  RotateCcw,
  Camera,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Eye,
} from 'lucide-react';
import { PrintOutcome } from './PrintOutcome';
import { usePrintOutcome } from './usePrintOutcome';
import { SecurityZoneToggles } from '../common/SecurityZoneToggles';
import { VenueInstitutionToggles } from '../common/VenueInstitutionToggles';
import { CAMPUS_PRINT_ZONE_REQUIRED, getDefaultGate, needsCampusPrintZone, SECURITY_ZONES, SecurityZoneField } from '@/core/domain/zones';

const CARD_WIDTH = (80 * 96) / 25.4;
const CARD_HEIGHT = (120 * 96) / 25.4;

type PassDetailsResult = { pass: PassEntity } | { message: string; retryable: boolean };

async function fetchPassDetails(id: string, signal: AbortSignal): Promise<PassDetailsResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`/api/passes/${encodeURIComponent(id)}`, { signal, cache: 'no-store' });
      if (response.ok) {
        const pass: PassEntity = await response.json();
        if (pass?.id === id) return { pass };
        return { message: 'The server returned incomplete pass details.', retryable: true };
      }
      if (response.status === 401) return { message: 'Your session expired. Sign in again to load the pass.', retryable: false };
      if (response.status === 403) return { message: 'You don’t have permission to access this pass.', retryable: false };
      if (response.status === 404) return { message: 'This pass is no longer available.', retryable: false };
      if (attempt === 0 && (response.status === 408 || response.status >= 500)) continue;
      return { message: 'The server could not load the full pass details.', retryable: true };
    } catch (error) {
      if (signal.aborted) return null;
      if (attempt === 0 && error instanceof TypeError) continue;
      return { message: 'Could not load the full pass details. Check your connection and try again.', retryable: true };
    }
  }
  return null;
}

interface SingleCardPrintModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onPrintCompleted: (pass: PassEntity) => void;
  onEdit?: (pass: PassEntity) => void;
  autoPrint?: boolean;
  previewOnly?: boolean;
  canEditPoliceAssignment?: boolean;
}

function waitForBadgeQr(card: HTMLElement): Promise<void> {
  const selector = 'img[alt="Verification QR Code" i]';
  if (card.querySelector(selector)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!card.querySelector(selector)) return;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve();
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('The verification QR code could not load. Try printing again.'));
    }, 3000);
    observer.observe(card, { childList: true, subtree: true });
  });
}

export const SingleCardPrintModal: React.FC<SingleCardPrintModalProps> = ({
  pass,
  isOpen,
  ...props
}) => {
  if (!isOpen || !pass) return null;
  return <SingleCardPrintContent key={pass.id} pass={pass} {...props} />;
};

function SingleCardPrintContent({
  pass,
  onClose,
  onPrintCompleted,
  onEdit,
  autoPrint = false,
  previewOnly = false,
  canEditPoliceAssignment = true,
}: Omit<SingleCardPrintModalProps, 'pass' | 'isOpen'> & { pass: PassEntity }) {
  const [activePass, setCurrentPass] = useState(pass);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsIssue, setDetailsIssue] = useState<{ message: string; retryable: boolean } | null>(null);
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [savingClearance, setSavingClearance] = useState<'zone' | 'venue' | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [clearanceError, setClearanceError] = useState('');
  const [showClearance, setShowClearance] = useState(false);
  const compactPreview = previewOnly && !showClearance;
  const [syncingPoliceDuty, setSyncingPoliceDuty] = useState(false);
  const [dutyError, setDutyError] = useState('');
  const [dutyEditorRevision, setDutyEditorRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPassDetails(pass.id, controller.signal).then((result) => {
      if (!result || controller.signal.aborted) return;
      if ('pass' in result) setCurrentPass(result.pass);
      else setDetailsIssue(result);
      setLoadingDetails(false);
    });
    return () => controller.abort();
  }, [pass.id, detailsAttempt]);

  const retryDetails = () => {
    setDetailsIssue(null);
    setLoadingDetails(true);
    setDetailsAttempt((attempt) => attempt + 1);
  };
  const detailsError = detailsIssue?.message;

  const canPrint = canPrintPassStatus(activePass);

  const [previewWidth, setPreviewWidth] = useState(0);
  const [reprintReason, setReprintReason] = useState('');
  const [showReprintDialog, setShowReprintDialog] = useState(false);

  const printCardRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const clearanceRef = useRef<HTMLElement>(null);

  const autoPrintFiredRef = useRef(false);

  useEffect(() => {
    if (showClearance) clearanceRef.current?.focus();
  }, [showClearance]);

  useEffect(() => {
    if (!previewViewportRef.current) return;
    const viewport = previewViewportRef.current;
    const updateWidth = () => setPreviewWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const previewScale = Math.min(1, (previewWidth || CARD_WIDTH) / CARD_WIDTH);

  // Pre-Print Validation Checkers
  const cleanMob = cleanMobileNumber(activePass.mobile_number);
  const cleanAad = cleanAadhaarNumber(activePass.govt_id_number);

  const hasFullName = Boolean(activePass.full_name && activePass.full_name.trim());
  const hasRank = Boolean(
    activePass.designation_or_trade?.trim() ||
      activePass.category_other?.trim() ||
      activePass.category?.trim()
  );
  const hasDistrictOrDept = Boolean(
    activePass.institution_other?.trim() || activePass.department?.trim()
  );
  const hasValidMobile = /^[6-9][0-9]{9}$/.test(cleanMob);
  const hasValidAadhaar =
    activePass.govt_id_type === 'Aadhaar' ? /^[2-9][0-9]{11}$/.test(cleanAad) : Boolean(cleanAad);
  const hasPhoto = isValidPhotoUrl(activePass.photo_url);
  const isPolicePass = activePass.pass_type === 'POLICE_FORCE' || Boolean(activePass.is_imported);
  const dutyBlocker = activePass.pass_type === 'POLICE_FORCE' ? policePrintBlocker(activePass) : '';
  const hasDutyClearance = activePass.pass_type === 'POLICE_FORCE'
    ? Boolean(activePass.police_zone?.trim() && activePass.police_sector_number?.trim() && activePass.police_sector_name?.trim())
    : Boolean(activePass.police_zone || activePass.police_sector_name || activePass.institution);

  const isDetailsComplete =
    hasFullName &&
    hasRank &&
    hasDistrictOrDept &&
    hasValidMobile &&
    hasValidAadhaar &&
    hasPhoto &&
    (!isPolicePass || hasDutyClearance);

  const governmentId = activePass.govt_id_type === 'Aadhaar' ? cleanAad : activePass.govt_id_number?.trim();
  const cardholderChecks = [
    { label: 'Name', value: activePass.full_name || 'Missing', valid: hasFullName, emphasis: 'font-bold' },
    ...(isPolicePass ? [
      { label: 'Rank', value: activePass.rank || activePass.designation_or_trade || activePass.category_other || activePass.category || 'Missing', valid: hasRank },
      { label: 'Department / unit', value: activePass.police_unit_district || activePass.institution_other || activePass.department || 'Missing', valid: hasDistrictOrDept },
    ] : [
      { label: 'Department / unit', value: activePass.department || activePass.institution_other || 'Missing', valid: hasDistrictOrDept },
      { label: 'Category', value: activePass.category || activePass.category_other || activePass.designation_or_trade || 'Missing', valid: hasRank },
    ]),
    { label: 'Mobile', value: cleanMob || 'Missing', valid: hasValidMobile, emphasis: 'font-mono' },
    { label: 'Govt ID', value: governmentId ? `${activePass.govt_id_type || 'Aadhaar'} (${governmentId})` : 'Missing', valid: hasValidAadhaar, emphasis: 'font-mono' },
    ...(isPolicePass ? [{ label: 'Duty clearance', value: hasDutyClearance ? 'Assigned' : 'Unassigned', valid: hasDutyClearance }] : []),
  ];
  const missingCampusZone = needsCampusPrintZone(activePass);
  const printReady = !loadingDetails && !detailsError && canPrint && isDetailsComplete &&
    !missingCampusZone && !savingClearance && !syncingPoliceDuty && !savingPhoto;
  const outcome = usePrintOutcome<PassEntity>((updated) => {
    setShowReprintDialog(false);
    setReprintReason('');
    onPrintCompleted(updated);
    onClose();
  });
  const close = () => outcome.closeIfIdle(onClose);
  const dialogRef = useDialog(true, close);

  const printBlocker = missingCampusZone ? CAMPUS_PRINT_ZONE_REQUIRED : !canPrint
    ? activePass.pass_type === 'POLICE_FORCE'
      ? 'This police pass cannot be printed in its current status.'
      : 'Only approved cards in Ready to Print or Printed status can be printed.'
    : dutyBlocker ? dutyBlocker
    : !hasPhoto ? 'Add a cardholder photo before printing.'
    : !isDetailsComplete ? (compactPreview ? 'Use Edit to complete the required pass details.' : 'Complete the flagged cardholder details before printing.') : '';
  const printNotice = outcome.error || detailsError || dutyError || photoError || (!loadingDetails && (missingCampusZone || previewOnly || autoPrint) ? printBlocker : '');
  const notice = printNotice && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p role={outcome.error || detailsError || dutyError ? 'alert' : 'status'}>{printNotice}</p>
      {detailsIssue?.retryable && <PillButton variant="outline" size="sm" onClick={retryDetails}>Try again</PillButton>}
      {compactPreview && printNotice === CAMPUS_PRINT_ZONE_REQUIRED && (
        <PillButton variant="outline" size="sm" onClick={() => setShowClearance(true)}>Assign zones</PillButton>
      )}
    </div>
  );
  const dialogTitle = compactPreview ? 'Badge preview' : 'Duty Access Card Print Station';

  const handlePrint = (reason?: string) => {
    if (!printReady) return;
    void outcome.start({ id: activePass.id, reason }, [activePass], async () => {
      const card = printCardRef.current;
      if (!card) throw new Error('The printable badge could not load. Try printing again.');
      if (activePass.qr_payload || activePass.verification_token) await waitForBadgeQr(card);
      await printSingleBadge(card, `Duty_ID_Card_${activePass.pass_number}`);
    });
  };

  useEffect(() => {
    if (!autoPrint || loadingDetails || detailsError || autoPrintFiredRef.current) return;
    // A direct Print click cannot carry over to a later clearance change.
    autoPrintFiredRef.current = true;
    handlePrint();
  }, [autoPrint, loadingDetails, detailsError, handlePrint]);

  // Update Bandobusth Duty Assignment for Police Force Passes
  const handlePoliceDutyChange = async (updates: {
    police_zone: string;
    police_sector_number: string;
    police_sector_name: string;
    police_custom_sector?: string;
    security_component?: string;
  }) => {
    if (syncingPoliceDuty || savingPhoto || outcome.locked) return;
    setSyncingPoliceDuty(true);
    setDutyError('');

    try {
      const response = await fetch(`/api/passes/${activePass.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          police_custom_sector: updates.police_custom_sector || null,
          security_component: updates.security_component || null,
        }),
      });
      const saved = await response.json().catch(() => null);
      if (!response.ok || !saved) throw new Error(saved?.error || 'Could not save the duty assignment.');
      setCurrentPass(saved);
    } catch (error) {
      setDutyError(error instanceof Error ? error.message : 'Could not save the duty assignment.');
      setDutyEditorRevision(revision => revision + 1);
    } finally {
      setSyncingPoliceDuty(false);
    }
  };

  const saveCampusClearance = async (
    updates: Partial<Pick<PassEntity, 'institution' | SecurityZoneField | 'gate_zone_a' | 'gate_zone_b' | 'gate_zone_c'>>,
    field: 'zone' | 'venue',
  ) => {
    if (savingClearance || savingPhoto || outcome.locked) return;
    setSavingClearance(field);
    setClearanceError('');
    try {
      const response = await fetch(`/api/passes/${activePass.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Clearance update failed');
      const saved: PassEntity = await response.json();
      setCurrentPass(saved);
    } catch {
      setClearanceError('Could not save operational clearance. Try again.');
    } finally {
      setSavingClearance(null);
    }
  };

  const handleToggleZone = (field: SecurityZoneField) => {
    const zone = SECURITY_ZONES.find(item => item.field === field);
    if (!zone) return;
    const enabled = !activePass[field];
    const gate = enabled ? (activePass[zone.gateField] || getDefaultGate(activePass.institution, zone.key)) : null;
    void saveCampusClearance({ [field]: enabled, [zone.gateField]: gate }, 'zone');
  };

  const handleSelectInstitution = (institution: 'IISER' | 'IIT' | 'ICI') => {
    void saveCampusClearance({
      institution,
      gate_zone_a: activePass.zone_a ? getDefaultGate(institution, 'A') : activePass.gate_zone_a,
      gate_zone_b: activePass.zone_b ? getDefaultGate(institution, 'B') : activePass.gate_zone_b,
      gate_zone_c: activePass.zone_c ? getDefaultGate(institution, 'C') : activePass.gate_zone_c,
    }, 'venue');
  };

  // Handle Desk Camera Capture
  const handlePhotoCaptured = async (photoDataUrl: string) => {
    setIsCameraOpen(false);
    if (!activePass) return;

    setSavingPhoto(true);
    setPhotoError('');
    try {
      const response = await fetch(`/api/passes/${activePass.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: photoDataUrl }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save photograph.');
      const saved: PassEntity = await response.json();
      setCurrentPass(saved);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not save photograph.');
    } finally {
      setSavingPhoto(false);
    }
  };

  return (
    <>
      {/* Hidden unscaled card strictly for single-page printing */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '80mm',
          height: '120mm',
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div ref={printCardRef}>
          {isPolicePass ? (
            <PrintablePoliceDutyCard pass={activePass} hideShadow={true} scale={1} />
          ) : (
            <PrintableDutyCard pass={activePass} hideShadow={true} scale={1} printDate={outcome.printDate} />
          )}
        </div>
      </div>

      {/* Screen UI Modal (strictly excluded from printing with no-print) */}
      {createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={dialogTitle}
          tabIndex={-1}
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden"
        >
          <div className={`flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-scaleUp sm:max-h-[calc(100dvh-2rem)] ${compactPreview ? 'max-w-md' : 'max-w-5xl'}`}>
            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 border-b border-police-crimson bg-police-navy px-3 py-2.5 text-white sm:gap-2 sm:px-5 sm:py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="hidden size-8 shrink-0 place-items-center rounded-full bg-police-crimson sm:grid">
                  {compactPreview ? <Eye aria-hidden="true" className="size-4" /> : <Printer aria-hidden="true" className="size-4" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold leading-tight">{dialogTitle}</h2>
                  <p className="mt-0.5 break-words text-[11px] text-slate-200">
                    {activePass.pass_number}{!compactPreview && ` · Print count ${activePass.printed_count || 0}`}
                  </p>
                </div>
              </div>
              {outcome.count === null && (
                <div className="col-start-2 row-start-1 flex items-center gap-1 sm:gap-1.5">
                  <PillButton
                    variant="crimson"
                    size="sm"
                    onClick={() => handlePrint()}
                    disabled={outcome.locked || !printReady}
                    className="max-sm:!gap-0 max-sm:!px-2.5"
                    title="Print duty ID card"
                    icon={<Printer aria-hidden="true" className="size-4" />}
                  >
                    <span className="sr-only sm:not-sr-only">{loadingDetails ? 'Loading…' : outcome.locked ? 'Opening…' : 'Print'}</span>
                  </PillButton>
                  {onEdit && (
                    <PillButton
                      variant="outline"
                      size="sm"
                      disabled={outcome.locked || loadingDetails || Boolean(detailsError) || Boolean(savingClearance) || syncingPoliceDuty}
                      onClick={() => onEdit(activePass)}
                      className="max-sm:!gap-0 max-sm:!px-2.5"
                      title="Edit pass details"
                      icon={<Pencil aria-hidden="true" className="size-4" />}
                    >
                      <span className="sr-only sm:not-sr-only">Edit</span>
                    </PillButton>
                  )}
                  {!compactPreview && (
                    <PillButton
                      variant="outline"
                      size="sm"
                      aria-expanded={showReprintDialog}
                      aria-controls={showReprintDialog ? 'print-replacement-panel' : undefined}
                      disabled={outcome.locked || !printReady}
                      className="max-sm:!gap-0 max-sm:!px-2.5"
                      title="Issue a replacement or reprint"
                      onClick={() => setShowReprintDialog(!showReprintDialog)}
                      icon={<RotateCcw aria-hidden="true" className="size-4" />}
                    >
                      <span className="sr-only sm:not-sr-only">Reprint</span>
                    </PillButton>
                  )}
                </div>
              )}
              <button
                type="button"
                aria-label="Close dialog"
                onClick={close}
                disabled={outcome.locked}
                className="operations-action col-start-3 row-start-1 grid size-9 shrink-0 place-items-center bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            {outcome.count !== null && (
              <div className="p-4 sm:p-6">
                <PrintOutcome
                  count={outcome.count}
                  saving={outcome.phase === 'saving'}
                  error={outcome.error}
                  onPrinted={outcome.confirm}
                  onNotPrinted={outcome.dismiss}
                />
              </div>
            )}

            {/* Modal Content */}
            <div
              className={`${
                outcome.count === null ? 'grid' : 'hidden'
              } min-h-0 min-w-0 flex-1 grid-cols-1 items-start gap-4 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-5 ${compactPreview ? '' : 'md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'}`}
              data-preview-scroll
            >
              {compactPreview && notice}

              {/* Print Controls & Pre-Print Validation Column */}
              {!compactPreview && <div className="min-w-0 space-y-3.5 break-words md:col-start-2 md:row-start-1">
                {notice}

                {showReprintDialog && (
                  <div id="print-replacement-panel" className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <label htmlFor="print-replacement-reason" className="block text-xs font-semibold text-rose-800">
                      Log Card Replacement Reason
                    </label>
                    <input
                      id="print-replacement-reason"
                      type="text"
                      autoFocus
                      maxLength={500}
                      value={reprintReason}
                      onChange={(e) => setReprintReason(e.target.value)}
                      placeholder="e.g. Card damaged / lost badge..."
                      className="operations-input px-3.5"
                    />
                    <div className="flex justify-end gap-2">
                      <PillButton
                        variant="danger"
                        size="sm"
                        onClick={() => handlePrint(reprintReason.trim())}
                        disabled={outcome.locked || !printReady || reprintReason.trim().length < 3}
                      >
                        Print Replacement
                      </PillButton>
                    </div>
                  </div>
                )}
                {!loadingDetails && !detailsError && <>
                <section aria-label="Pre-print details" className="min-w-0 rounded-3xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-police-navy">Cardholder credentials</h3>
                  <p role="status" className="sr-only">{isDetailsComplete ? 'Pre-print checks complete' : 'Pre-print details need attention'}</p>

                  <dl className="mt-2 divide-y divide-slate-100 text-sm">
                    {cardholderChecks.map(({ label, value, valid, emphasis = 'font-medium' }) => (
                      <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-x-3 py-2">
                        <dt className="font-medium text-slate-600">{label}</dt>
                        <dd className={`min-w-0 break-words text-right ${valid ? 'text-slate-900' : 'text-amber-900'} ${emphasis}`}>
                          {!valid && <AlertTriangle aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-amber-700" />}
                          {value}
                          {!valid && <span className="sr-only">, needs attention</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-2.5">
                    <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      {hasPhoto ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-700" />
                      ) : (
                        <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-700" />
                      )}
                      {hasPhoto ? 'Photograph attached' : 'Photograph required to print'}
                    </p>
                    <PillButton
                      variant={hasPhoto ? 'secondary' : 'crimson'}
                      size="sm"
                      onClick={() => setIsCameraOpen(true)}
                      disabled={savingPhoto || Boolean(savingClearance) || syncingPoliceDuty || outcome.locked}
                      icon={<Camera aria-hidden="true" className="size-3.5" />}
                    >
                      {savingPhoto ? 'Saving photo…' : hasPhoto ? 'Retake photo' : 'Add photo'}
                    </PillButton>
                  </div>
                </section>

                {isPolicePass ? (canEditPoliceAssignment && (
                  <PoliceBandobusthSelector
                    key={dutyEditorRevision}
                    zone={activePass.police_zone}
                    sectorNumber={activePass.police_sector_number}
                    sectorName={activePass.police_sector_name}
                    customSector={activePass.police_custom_sector}
                    securityComponent={activePass.security_component}
                    onChange={handlePoliceDutyChange}
                    loading={syncingPoliceDuty || outcome.locked || savingPhoto}
                    saveCustomLocationOnBlur
                    collapsible
                  />
                )) : (
                  <section ref={clearanceRef} tabIndex={-1} aria-labelledby="campus-clearance-title" className="operations-panel space-y-3.5 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-50 text-police-crimson">
                          <ShieldCheck aria-hidden="true" className="size-4" />
                        </span>
                        <h3 id="campus-clearance-title" className="text-sm font-semibold text-police-navy">Operational clearance &amp; venue</h3>
                      </div>
                      {savingClearance === 'venue' && <span role="status" className="text-xs text-slate-600">Saving venue…</span>}
                    </div>
                    {clearanceError && <p role="alert" className="text-sm text-rose-700">{clearanceError}</p>}

                    <VenueInstitutionToggles
                      value={activePass.institution}
                      onChange={handleSelectInstitution}
                      disabled={Boolean(savingClearance)}
                      embedded
                    />
                    <SecurityZoneToggles
                      zoneA={Boolean(activePass.zone_a)}
                      zoneB={Boolean(activePass.zone_b)}
                      zoneC={Boolean(activePass.zone_c)}
                      onToggle={handleToggleZone}
                      disabled={Boolean(savingClearance)}
                      loading={savingClearance === 'zone'}
                      institution={activePass.institution}
                      embedded
                    />
                  </section>
                )}

                {/* Print Calibration Info */}
                <div className="text-center text-[10.5px] text-slate-400 font-medium py-1">
                  Single-page print calibrated for 80 × 120 mm synthetic stock (3 mm top margin)
                </div>
                </>}
              </div>}

              {/* Card Preview Column */}
              <div className={`flex min-w-0 flex-col items-center rounded-3xl border border-slate-200 bg-slate-100/70 p-3 sm:p-4 ${compactPreview ? '' : 'md:col-start-1 md:row-start-1'}`}>
                <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2">
                  {!compactPreview && <h3 className="text-sm font-semibold text-police-navy">Badge preview</h3>}
                  <span className="ml-auto rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600">80 × 120 mm</span>
                </div>

                {/* The Badge Interactive Preview */}
                <div
                  ref={previewViewportRef}
                  className="w-full min-w-0 max-w-full overflow-hidden"
                  role="region"
                  aria-label="Badge preview"
                >
                  <div
                    className="relative mx-auto"
                    style={{
                      width: CARD_WIDTH * previewScale,
                      height: CARD_HEIGHT * previewScale,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0"
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      {isPolicePass ? (
                        <PrintablePoliceDutyCard pass={activePass} scale={1} />
                      ) : (
                        <PrintableDutyCard pass={activePass} scale={1} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full text-center mt-3 text-[11px] font-black text-slate-600 bg-white/90 border border-slate-200/90 py-1.5 px-4 rounded-full shadow-2xs">
                  Valid from print date through {PASS_VALID_TO_LABEL}
                </div>

                {loadingDetails && (
                  <div className="mt-2 px-3.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full text-[10px] font-bold animate-pulse shadow-2xs">
                    Loading individual photograph &amp; signatures...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Desk Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />
    </>
  );
};
