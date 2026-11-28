'use client';

import { OperationsHeader } from '../common/OperationsHeader';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { OFFICES } from '@/core/domain/offices';
import { SignaturePad } from '../badges/SignaturePad';
import { PillButton } from '../common/PillButton';
import { cleanSignaturePixels } from '@/lib/clean-signature';
import type { AuthoritySignatureConfig, SignaturePreset } from '@/core/interfaces/config-repository.interface';
import {
  PenTool,
  Upload,
  CheckCircle2,
  AlertCircle,
  Layers,
  RotateCcw,
  ShieldCheck,
  RefreshCw,
  Trash2,
} from 'lucide-react';

function renderSignature({ sourceUrl, fittedSource, scale, offsetX, offsetY, rotation, cleanBackground }: SignaturePreset): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = () => reject(new Error('Could not read the signature image.'));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 140;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not open the signature preview.');
        context.translate(canvas.width / 2 + offsetX * 2.2, canvas.height / 2 + offsetY * 2.2);
        context.rotate(rotation * Math.PI / 180);
        context.scale(scale, scale);
        const aspect = image.naturalWidth / image.naturalHeight;
        const width = Math.min(fittedSource ? 400 : 240, (fittedSource ? 140 : 90) * aspect);
        const height = width / aspect;
        context.drawImage(image, -width / 2, -height / 2, width, height);
        if (cleanBackground) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          cleanSignaturePixels(pixels.data, canvas.width, canvas.height);
          context.putImageData(pixels, 0, 0);
        }
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.src = sourceUrl;
  });
}

function SignatureAdjustment({ label, value, min, max, step = 1, nudge = step, display, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  nudge?: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const shift = (amount: number) => onChange(Math.max(min, Math.min(max, Number((value + amount).toFixed(2)))));
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-1.5 text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="shrink-0 font-mono text-police-crimson">{display}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => shift(-nudge)} className="operations-action grid size-7 shrink-0 place-items-center border border-slate-200 bg-white font-semibold text-police-navy hover:bg-slate-100">−</button>
        <input
          type="range"
          aria-label={label}
          aria-valuetext={display}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 accent-police-crimson"
        />
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => shift(nudge)} className="operations-action grid size-7 shrink-0 place-items-center border border-slate-200 bg-white font-semibold text-police-navy hover:bg-slate-100">+</button>
      </div>
    </div>
  );
}

export const AuthoritySignaturePortal: React.FC = () => {
  const { user } = useAuth();

  // Signature state
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedPreset, setSavedPreset] = useState<SignaturePreset | null>(null);
  const [rawSignature, setRawSignature] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [authorityTitle, setAuthorityTitle] = useState('');

  // Adjustment Tool States
  const [scale, setScale] = useState<number>(1.2);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [cleanBackground, setCleanBackground] = useState<boolean>(true);

  // Status & UI States
  const [busyAction, setBusyAction] = useState<'save' | 'apply' | 'remove' | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'DRAW' | 'UPLOAD'>('UPLOAD');

  const loading = busyAction !== null;
  const officeName = OFFICES.find((o) => o.id === user.officeId)?.name ?? 'District Central Command';

  const fittedSource = Boolean(
    rawSignature &&
      (savedPreset
        ? rawSignature === savedPreset.sourceUrl && savedPreset.fittedSource
        : rawSignature === savedSignature)
  );

  const preset = useMemo<SignaturePreset | undefined>(() => rawSignature
    ? { sourceUrl: rawSignature, fittedSource, scale, offsetX, offsetY, rotation, cleanBackground }
    : undefined, [rawSignature, fittedSource, scale, offsetX, offsetY, rotation, cleanBackground]);
  const [renderedPreview, setRenderedPreview] = useState<{ preset: SignaturePreset; url: string | null }>();

  useEffect(() => {
    if (!preset) return;
    let cancelled = false;
    void renderSignature(preset).then(url => {
      if (!cancelled) setRenderedPreview({ preset, url });
    }, () => {
      if (!cancelled) setRenderedPreview({ preset, url: null });
    });
    return () => { cancelled = true; };
  }, [preset]);

  const previewUrl = preset && renderedPreview?.preset === preset ? renderedPreview.url : undefined;

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setFetching(true);
    try {
      const res = await fetch('/api/config/authority-signature', {
        signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error('Could not load current authority signature configuration.');
      const data: AuthoritySignatureConfig = await res.json();
      if (!signal?.aborted) {
        const preset = data.preset;
        setRawSignature(preset?.sourceUrl ?? data.signatureUrl ?? null);
        setSavedSignature(data.signatureUrl ?? null);
        setSavedPreset(preset ?? null);
        setAuthorityName(data.name ?? '');
        setAuthorityTitle(data.title ?? '');
        setScale(preset?.scale ?? (data.signatureUrl ? 1 : 1.2));
        setOffsetX(preset?.offsetX ?? 0);
        setOffsetY(preset?.offsetY ?? 0);
        setRotation(preset?.rotation ?? 0);
        setCleanBackground(preset?.cleanBackground ?? !data.signatureUrl);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to fetch signature configuration.');
      }
    } finally {
      if (!signal?.aborted) {
        setFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchConfig(controller.signal);
    return () => controller.abort();
  }, [fetchConfig]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, SVG).');
      return;
    }

    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const ratio = Math.min(1, 800 / image.width, 400 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Signature processing is unavailable.');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        setRawSignature(canvas.toDataURL('image/png'));
        setError(null);
        setScale(1.3);
        setOffsetX(0);
        setOffsetY(0);
        setRotation(0);
        setCleanBackground(true);
      } catch {
        setError('Could not read the signature image.');
      } finally {
        URL.revokeObjectURL(source);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      setError('Could not read the signature image.');
    };
    image.src = source;
  };

  const handleResetAdjustments = () => {
    setScale(1.0);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setCleanBackground(!fittedSource);
  };

  // Removing asks for confirmation on the page (browser pop-ups can be blocked, which silently cancelled it).
  const [confirmRemove, setConfirmRemove] = useState(false);
  const handleRemove = async () => {
    setConfirmRemove(false);
    setBusyAction('remove');
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/config/authority-signature', { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to remove authority signature.');
      setRawSignature(null);
      setSavedSignature(null);
      setSavedPreset(null);
      setScale(1.2);
      setOffsetX(0);
      setOffsetY(0);
      setRotation(0);
      setCleanBackground(true);
      setSuccessMsg('Saved authority signature removed successfully. Existing printed cards remain unaffected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove authority signature.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSave = async (applyToUnprinted: boolean) => {
    if (!authorityName.trim()) {
      setError('Please enter the authority signatory name and rank.');
      return;
    }

    try {
      setBusyAction(applyToUnprinted ? 'apply' : 'save');
      setError(null);
      setSuccessMsg(null);

      const finalSignatureUrl = preset ? previewUrl ?? await renderSignature(preset) : null;

      const res = await fetch('/api/config/authority-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureUrl: finalSignatureUrl,
          name: authorityName.trim(),
          title: authorityTitle.trim(),
          applyToUnprinted,
          preset,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save authority signature.');

      if (preset) {
        setSavedSignature(finalSignatureUrl);
        setSavedPreset(preset);
      } else {
        setRawSignature(savedPreset?.sourceUrl ?? savedSignature);
      }

      if (applyToUnprinted) {
        const count = data.updatedCount ?? 0;
        setSuccessMsg(
          count > 0
            ? `Authority signature successfully saved and applied to ${count} unprinted ${count === 1 ? 'pass' : 'passes'}.`
            : 'Authority signature successfully saved. All unprinted passes are up-to-date.'
        );
      } else {
        setSuccessMsg('Authority signature successfully saved as future default.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setBusyAction(null);
    }
  };


  return (
    <div className="min-w-0 space-y-3 pb-4">
      <OperationsHeader
        title="Issuing Authority Signature"
        description={`${officeName} · ${savedSignature ? 'Digital signature active' : 'No signature configured'}`}
      >
        <PillButton
          variant="outline"
          size="sm"
          disabled={fetching || loading}
          onClick={() => void fetchConfig()}
          icon={<RefreshCw aria-hidden="true" className={`size-3.5 ${fetching ? 'motion-safe:animate-spin' : ''}`} />}
        >
          Reload settings
        </PillButton>
      </OperationsHeader>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          <span className="flex items-center gap-2"><AlertCircle aria-hidden="true" className="size-4 shrink-0" />{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold underline">Dismiss</button>
        </div>
      )}
      {successMsg && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
          <span className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="font-semibold underline">Dismiss</button>
        </div>
      )}

      <div className="operations-enter grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="signatory-heading" className="operations-panel space-y-3.5 p-4">
          <h3 id="signatory-heading" className="text-base font-semibold text-police-navy">Signatory details</h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="min-w-0 text-xs font-semibold text-slate-700">
              Name / rank
              <input type="text" required value={authorityName} onChange={(event) => setAuthorityName(event.target.value)} placeholder="Name and rank" className="operations-input mt-1 px-3.5 font-normal" />
            </label>
            <label className="min-w-0 text-xs font-semibold text-slate-700">
              Official designation
              <input type="text" value={authorityTitle} onChange={(event) => setAuthorityTitle(event.target.value)} placeholder="Official designation" className="operations-input mt-1 px-3.5 font-normal" />
            </label>
          </div>

          <div className="space-y-2.5 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-police-navy">Signature source</h4>
              <div role="group" aria-label="Signature source" className="flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1">
                <button type="button" aria-pressed={activeTab === 'UPLOAD'} onClick={() => setActiveTab('UPLOAD')} className={`operations-action inline-flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-semibold ${activeTab === 'UPLOAD' ? 'bg-police-crimson text-white' : 'text-slate-700 hover:bg-white'}`}>
                  <Upload aria-hidden="true" className="size-3.5" /> Upload image
                </button>
                <button type="button" aria-pressed={activeTab === 'DRAW'} onClick={() => setActiveTab('DRAW')} className={`operations-action inline-flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-semibold ${activeTab === 'DRAW' ? 'bg-police-crimson text-white' : 'text-slate-700 hover:bg-white'}`}>
                  <PenTool aria-hidden="true" className="size-3.5" /> Digital pen
                </button>
              </div>
            </div>
            {activeTab === 'DRAW' ? (
              <SignaturePad
                label="Draw the signature"
                initialSignature={rawSignature}
                onSignatureChange={(url) => { setRawSignature(url); setError(null); }}
                onClear={() => setRawSignature(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-2.5">
                <p className="text-xs text-slate-600">PNG, JPG or SVG. Use a white or transparent background.</p>
                <label className="operations-action inline-flex min-h-8 cursor-pointer items-center gap-1.5 bg-police-navy px-3 text-xs font-semibold text-white hover:bg-police-navyLight focus-within:ring-2 focus-within:ring-police-crimson focus-within:ring-offset-2">
                  <Upload aria-hidden="true" className="size-3.5" />
                  Browse image file
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="sr-only" />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2.5 border-t border-slate-200 pt-3">
            <h4 className="text-sm font-semibold text-police-navy">Save signature</h4>
            <p className="text-xs text-slate-600">Apply changes to future passes only or include all unprinted passes in your jurisdiction.</p>
            <div className="flex flex-wrap items-center gap-2">
              <PillButton variant="primary" size="sm" icon={<ShieldCheck aria-hidden="true" className="size-3.5" />} disabled={loading || fetching || !authorityName.trim()} onClick={() => void handleSave(false)}>
                {busyAction === 'save' ? 'Saving…' : 'Save for future passes'}
              </PillButton>
              <PillButton variant="crimson" size="sm" icon={<Layers aria-hidden="true" className="size-3.5" />} disabled={loading || fetching || !authorityName.trim()} onClick={() => void handleSave(true)}>
                {busyAction === 'apply' ? 'Applying…' : 'Apply to unprinted passes'}
              </PillButton>
              {savedSignature && confirmRemove && (
                <span role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <span className="min-w-0 flex-1">Remove the saved authority signature? Cards already printed keep their signature.</span>
                  <PillButton variant="crimson" size="sm" disabled={loading || fetching} onClick={() => void handleRemove()}>Yes, remove</PillButton>
                  <PillButton variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Cancel</PillButton>
                </span>
              )}
              {savedSignature && !confirmRemove && (
                <PillButton variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" className="size-3.5" />} disabled={loading || fetching} onClick={() => setConfirmRemove(true)}>
                  {busyAction === 'remove' ? 'Removing…' : 'Remove saved signature'}
                </PillButton>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="signature-preview-heading" className="operations-panel space-y-3 p-4">
          <h3 id="signature-preview-heading" className="text-base font-semibold text-police-navy">Live signature preview</h3>
          <div className="flex justify-center rounded-2xl bg-slate-50 p-2.5">
            <div className="relative flex h-[90px] w-full max-w-[250px] flex-col justify-between overflow-hidden rounded-lg border-[1.5px] border-police-navy bg-white p-2 text-center">
              <div className="relative flex h-[46px] w-full items-center justify-center overflow-hidden">
                {previewUrl ? (
                  <img src={previewUrl} alt="Authority signature preview" className="pointer-events-none h-full w-full select-none object-contain" />
                ) : (
                  <span className="text-xs text-slate-500">
                    {!preset ? 'No signature provided' : previewUrl === null ? 'Could not render signature' : 'Preparing preview…'}
                  </span>
                )}
              </div>
              <div className="w-full border-t border-police-navy pt-0.5">
                <div className="text-[7.5px] font-bold uppercase leading-none text-police-navy">Issuing Authority (With Seal)</div>
                <div className="truncate text-[7px] font-bold leading-tight text-police-navy">{authorityName || 'Authority Signatory'}</div>
                <div className="truncate text-[6.2px] font-semibold leading-tight text-slate-600">{authorityTitle || 'Official Designation'}</div>
              </div>
            </div>
          </div>

          {rawSignature && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-police-navy">Placement</h4>
                <PillButton variant="ghost" size="sm" onClick={handleResetAdjustments} icon={<RotateCcw aria-hidden="true" className="size-3.5" />}>Reset placement</PillButton>
              </div>
              <div className="grid gap-2 min-[390px]:grid-cols-2">
                <SignatureAdjustment label="Size" value={scale} min={0.4} max={2.8} step={0.05} nudge={0.1} display={`${Math.round(scale * 100)}%`} onChange={setScale} />
                <SignatureAdjustment label="Vertical offset" value={offsetY} min={-25} max={25} nudge={2} display={`${offsetY}px`} onChange={setOffsetY} />
                <SignatureAdjustment label="Horizontal offset" value={offsetX} min={-45} max={45} nudge={3} display={`${offsetX}px`} onChange={setOffsetX} />
                <SignatureAdjustment label="Rotation" value={rotation} min={-15} max={15} display={`${rotation}°`} onChange={setRotation} />
              </div>
              <label className="flex items-center gap-2 border-t border-slate-200 pt-2.5 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={cleanBackground} onChange={(event) => setCleanBackground(event.target.checked)} className="size-4 accent-police-crimson" />
                Clean background and boost ink contrast
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
