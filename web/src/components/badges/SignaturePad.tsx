'use client';

import '@/lib/client-safe-json';
import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, PenTool, Upload } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  onSignatureChange: (dataUrl: string) => void;
  initialSignature?: string | null;
  onClear?: () => void;
  allowSample?: boolean;
  disabled?: boolean;
  onUploadPendingChange?: (pending: boolean) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  onSignatureChange,
  initialSignature,
  onClear,
  allowSample = true,
  disabled = false,
  onUploadPendingChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);
  const pendingUpload = useRef<symbol | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const busy = disabled || uploading;

  useEffect(() => () => {
    if (pendingUpload.current) {
      pendingUpload.current = null;
      onUploadPendingChange?.(false);
    }
  }, [onUploadPendingChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    }

    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(rect.width / img.width, rect.height / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        ctx.drawImage(img, (rect.width - width) / 2, (rect.height - height) / 2, width, height);
      };
      img.src = initialSignature;
      return () => { img.onload = null; };
    }
  }, [initialSignature]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || pendingUpload.current) return;
    setUploadError('');
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSignatureChange(dataUrl);
  };

  const handleClear = () => {
    setUploadError('');
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange('');
    if (onClear) onClear();
  };

  const handleApplySample = () => {
    setUploadError('');
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 220;
    const h = rect.height || 60;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.strokeStyle = '#0B2545';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.65);
    ctx.bezierCurveTo(w * 0.25, h * 0.15, w * 0.35, h * 0.85, w * 0.48, h * 0.35);
    ctx.bezierCurveTo(w * 0.56, h * 0.15, w * 0.65, h * 0.75, w * 0.85, h * 0.45);
    ctx.stroke();
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    onSignatureChange(dataUrl);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || disabled || pendingUpload.current) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setUploadError('Choose a PNG or JPEG signature.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Choose a signature image of 10 MB or less.');
      return;
    }

    const request = Symbol('signature upload');
    pendingUpload.current = request;
    setUploading(true);
    setUploadError('');
    onUploadPendingChange?.(true);

    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (pendingUpload.current !== request) return;
        const scale = Math.min(1, 800 / bitmap.width, 240 / bitmap.height);
        const image = document.createElement('canvas');
        image.width = Math.max(1, Math.round(bitmap.width * scale));
        image.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = image.getContext('2d');
        if (!ctx) throw new Error('Signature image processing is unavailable.');
        ctx.drawImage(bitmap, 0, 0, image.width, image.height);
        onSignatureChange(image.toDataURL('image/png'));
      } finally {
        bitmap.close();
      }
    } catch {
      if (pendingUpload.current === request) setUploadError('Could not open this image. Try another PNG or JPEG.');
    } finally {
      if (pendingUpload.current === request) {
        pendingUpload.current = null;
        setUploading(false);
        onUploadPendingChange?.(false);
      }
    }
  };

  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-slate-500" />
          {label}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {onUploadPendingChange && (
            <>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={handleUpload} />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="flex items-center gap-1 text-[10px] font-bold text-[#0B2545] hover:underline disabled:opacity-50"
              >
                <Upload className="h-3 w-3" />
                {uploading ? 'Uploading…' : 'Upload signature'}
              </button>
            </>
          )}
          {allowSample && (
            <button
              type="button"
              onClick={handleApplySample}
              disabled={busy}
              className="text-[10px] font-bold text-[#0B2545] hover:underline"
            >
              Apply Sample
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-0.5"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Clear
          </button>
        </div>
      </div>
      {uploadError && <p role="alert" className="text-xs text-rose-700">{uploadError}</p>}

      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-16 bg-white border border-dashed border-slate-300 rounded-lg cursor-crosshair touch-none"
        />
        <span className="absolute bottom-1 right-2 text-[8px] text-slate-400 select-none pointer-events-none">
          Sign inside box
        </span>
      </div>
    </div>
  );
};
