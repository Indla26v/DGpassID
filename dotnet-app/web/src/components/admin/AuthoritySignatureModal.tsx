'use client';

import { useDialog } from '../common/useDialog';
import React, { useState, useEffect } from 'react';
import { SignaturePad } from '../badges/SignaturePad';
import { PillButton } from '../common/PillButton';
import {
  X,
  PenTool,
  Upload,
  CheckCircle,
  ShieldCheck,
  AlertCircle,
  FileSignature,
  ZoomIn,
  Move,
  RotateCw,
  RotateCcw,
  Sparkles,
  Sliders,
} from 'lucide-react';

interface AuthoritySignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const AuthoritySignatureModal: React.FC<AuthoritySignatureModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  // Raw signature data (original drawing or uploaded image)
  const dialogRef = useDialog(isOpen, onClose);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [rawSignature, setRawSignature] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [authorityTitle, setAuthorityTitle] = useState('');

  // Adjustment Tool States
  const [scale, setScale] = useState<number>(1.2);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [cleanBackground, setCleanBackground] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'DRAW' | 'UPLOAD'>('UPLOAD');

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setFetching(true);
      setHasSavedSignature(false);
      fetch('/api/config/authority-signature')
        .then((res) => {
          if (!res.ok) throw new Error('Could not load the authority signature.');
          return res.json();
        })
        .then((data) => {
          setRawSignature(data.signatureUrl ?? null);
          setHasSavedSignature(Boolean(data.signatureUrl));
          if (data.name) setAuthorityName(data.name);
          if (data.title) setAuthorityTitle(data.title);
        })
        .catch((err) => setError(err.message))
        .finally(() => setFetching(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawSignature(reader.result as string);
      setError(null);
      // Reset adjustments for fresh image
      setScale(1.3);
      setOffsetX(0);
      setOffsetY(0);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const handleResetAdjustments = () => {
    setScale(1.0);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setCleanBackground(true);
  };

  /**
   * Bakes all visual adjustments (scale, position X/Y, rotation, transparent background cleanup)
   * into a standardized high-resolution canvas output so all passes and badges render the signature
   * with the exact dialed-in fit without relying on runtime CSS transforms.
   */
  const exportAdjustedSignature = (rawUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 140;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(rawUrl);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Position at center + offset (scaled for 400x140 resolution)
        ctx.translate(canvas.width / 2 + offsetX * 2.2, canvas.height / 2 + offsetY * 2.2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale, scale);

        // Aspect ratio preserved rendering
        const aspect = img.width / img.height;
        let drawW = 240;
        let drawH = 240 / aspect;
        if (drawH > 90) {
          drawH = 90;
          drawW = 90 * aspect;
        }

        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Optional background transparency cleanup (removes off-white/gray scanned paper)
        if (cleanBackground) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // If pixel is paper-white or light grey, make transparent
            if (r > 195 && g > 195 && b > 195) {
              data[i + 3] = 0;
            } else if (data[i + 3] > 0) {
              // Deepen ink contrast for razor sharp lines
              data[i] = Math.max(0, r - 35);
              data[i + 1] = Math.max(0, g - 35);
              data[i + 2] = Math.max(0, b - 35);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    });
  };

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/config/authority-signature', { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to remove authority signature.');
      setRawSignature(null);
      setHasSavedSignature(false);
      setScale(1.2);
      setOffsetX(0);
      setOffsetY(0);
      setRotation(0);
      setSuccessMsg('Saved signature removed. Existing card signatures are preserved.');
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove authority signature.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rawSignature) {
      setError('Please draw or upload an official signature.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Process and bake the adjustments into clean output PNG
      const finalSignatureUrl = await exportAdjustedSignature(rawSignature);

      const res = await fetch('/api/config/authority-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureUrl: finalSignatureUrl,
          name: authorityName.trim(),
          title: authorityTitle.trim(),
          operatorName: 'Security Administrator',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save authority signature.');
      }

      setHasSavedSignature(true);
      setSuccessMsg('Authority signature saved.');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Authority signature" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#8B1A1A] flex items-center justify-center">
              <FileSignature className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Issuing Authority Signature Protocol
              </h2>
              <p className="text-[11px] text-slate-300">
                Official digital signatory with precision fit &amp; alignment tools
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Signatory Particulars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Authority Signatory Name / Rank
              </label>
              <input
                type="text"
                value={authorityName}
                onChange={(e) => setAuthorityName(e.target.value)}
                placeholder="e.g. K. V. Rajendranath Reddy, IPS"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Authority Designation
              </label>
              <input
                type="text"
                value={authorityTitle}
                onChange={(e) => setAuthorityTitle(e.target.value)}
                placeholder="e.g. Director General of Police / Security Nodal Officer"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
              />
            </div>
          </div>

          {/* Mode Switcher: Draw vs Upload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Digital Signature</span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('DRAW')}
                  className={`px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 ${
                    activeTab === 'DRAW'
                      ? 'bg-[#0B2545] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PenTool className="w-3 h-3" />
                  <span>Digital Pen</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('UPLOAD')}
                  className={`px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 ${
                    activeTab === 'UPLOAD'
                      ? 'bg-[#0B2545] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            {activeTab === 'DRAW' ? (
              <SignaturePad
                label="Sign here as the Issuing Authority"
                initialSignature={rawSignature}
                onSignatureChange={(url) => setRawSignature(url)}
                onClear={() => setRawSignature(null)}
              />
            ) : (
              <div className="p-3.5 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50 text-center">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">
                  Upload Official Authority Signature Image (PNG, JPG)
                </span>
                <span className="text-[10px] text-slate-500">
                  Transparent or white background recommended. You can adjust fit below.
                </span>
                <label className="mt-1 px-4 py-1.5 rounded-full bg-[#0B2545] text-white text-xs font-bold cursor-pointer hover:bg-[#0B2545]/90 transition">
                  Browse File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* SIGNATURE ADJUSTMENT TOOLS (PRECISION FIT SUITE) */}
          {rawSignature && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B2545] uppercase tracking-wide">
                  <Sliders className="w-4 h-4 text-[#8B1A1A]" />
                  <span>Signature Adjustment Tools (Perfect Fit)</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetAdjustments}
                  className="text-[11px] font-bold text-slate-500 hover:text-rose-700 flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset All</span>
                </button>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                {/* 1. Scale / Size */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <ZoomIn className="w-3 h-3 text-slate-500" />
                      <span>Signature Size (Zoom)</span>
                    </span>
                    <span className="font-mono text-[#8B1A1A]">{Math.round(scale * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="0.4"
                      max="2.8"
                      step="0.05"
                      value={scale}
                      onChange={(e) => setScale(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B2545]"
                    />
                    <button
                      type="button"
                      onClick={() => setScale((s) => Math.min(2.8, Number((s + 0.1).toFixed(2))))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 2. Vertical Position (Y) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <Move className="w-3 h-3 text-slate-500" />
                      <span>Vertical Offset (Up / Down)</span>
                    </span>
                    <span className="font-mono text-[#8B1A1A]">
                      {offsetY > 0 ? `+${offsetY}px` : `${offsetY}px`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOffsetY((y) => Math.max(-25, y - 2))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <input
                      type="range"
                      min="-25"
                      max="25"
                      step="1"
                      value={offsetY}
                      onChange={(e) => setOffsetY(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B2545]"
                    />
                    <button
                      type="button"
                      onClick={() => setOffsetY((y) => Math.min(25, y + 2))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                      title="Move Down"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                {/* 3. Horizontal Position (X) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <Move className="w-3 h-3 text-slate-500 rotate-90" />
                      <span>Horizontal Offset (Left / Right)</span>
                    </span>
                    <span className="font-mono text-[#8B1A1A]">
                      {offsetX > 0 ? `+${offsetX}px` : `${offsetX}px`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOffsetX((x) => Math.max(-45, x - 3))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                      title="Move Left"
                    >
                      ←
                    </button>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="1"
                      value={offsetX}
                      onChange={(e) => setOffsetX(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B2545]"
                    />
                    <button
                      type="button"
                      onClick={() => setOffsetX((x) => Math.min(45, x + 3))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                      title="Move Right"
                    >
                      →
                    </button>
                  </div>
                </div>

                {/* 4. Rotation Angle */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <RotateCw className="w-3 h-3 text-slate-500" />
                      <span>Straighten / Rotate</span>
                    </span>
                    <span className="font-mono text-[#8B1A1A]">{rotation}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRotation((r) => Math.max(-15, r - 1))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                    >
                      ↶
                    </button>
                    <input
                      type="range"
                      min="-15"
                      max="15"
                      step="1"
                      value={rotation}
                      onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B2545]"
                    />
                    <button
                      type="button"
                      onClick={() => setRotation((r) => Math.min(15, r + 1))}
                      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center shrink-0"
                    >
                      ↷
                    </button>
                  </div>
                </div>
              </div>

              {/* Background Clean Toggle */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanBackground}
                    onChange={(e) => setCleanBackground(e.target.checked)}
                    className="accent-[#0B2545] rounded"
                  />
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Auto-Clean Paper Background &amp; Boost Ink Contrast</span>
                  </span>
                </label>
                <span className="text-[10px] text-slate-400">
                  Eliminates gray paper scans
                </span>
              </div>
            </div>
          )}

          {/* LIVE CARD PREVIEW BOX WITH REAL-TIME ADJUSTMENTS */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                PREVIEW: ISSUING AUTHORITY BADGE BLOCK
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                Live badge sizing preview
              </span>
            </div>

            <div className="w-[220px] mx-auto border-[1.5px] border-[#0B2545] bg-white rounded p-1.5 text-center flex flex-col justify-between h-[72px] relative overflow-hidden shadow-sm">
              {/* Signature Area with Transforms */}
              <div className="w-full h-[38px] flex items-center justify-center relative overflow-hidden">
                {rawSignature ? (
                  <img
                    src={rawSignature}
                    alt="Authority Signature"
                    className="max-h-[34px] max-w-[140px] object-contain mix-blend-multiply z-10 transition-transform duration-75 select-none pointer-events-none"
                    style={{
                      transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                      filter: cleanBackground ? 'contrast(1.2) brightness(0.95)' : undefined,
                    }}
                  />
                ) : (
                  <span className="text-[7.5px] font-mono text-slate-400 font-bold z-10">
                    {authorityName || 'Issuing authority'}
                  </span>
                )}
              </div>

              {/* Bottom Label and Signatory Title */}
              <div className="border-t border-[#0B2545] w-11/12 mx-auto pt-[2px]">
                <div className="text-[6.8px] font-bold text-[#0B2545] uppercase leading-none">
                  Issuing Authority (With Seal)
                </div>
                <div className="text-[5.5px] font-semibold text-slate-600 leading-tight mt-[1px] truncate">
                  {authorityTitle || 'Director General of Police / Security Nodal Officer'}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600">This signature is used for future approvals for this office. Removing it preserves signatures already saved on cards.</p>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <PillButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </PillButton>

          <PillButton variant="danger" onClick={handleRemove} disabled={loading || fetching || !hasSavedSignature}>
            Remove current signature
          </PillButton>

          <PillButton
            variant="crimson"
            onClick={handleSave}
            disabled={loading || fetching || !rawSignature}
            icon={<ShieldCheck className="w-4 h-4" />}
          >
            {loading ? 'Baking & Saving...' : 'Save signature'}
          </PillButton>
        </div>
      </div>
    </div>
  );
};
