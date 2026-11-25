'use client';

import React, { useRef, useEffect } from 'react';
import { RotateCcw, PenTool } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  onSignatureChange: (dataUrl: string) => void;
  initialSignature?: string | null;
  onClear?: () => void;
  allowSample?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  onSignatureChange,
  initialSignature,
  onClear,
  allowSample = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

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
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = initialSignature;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange('');
    if (onClear) onClear();
  };

  const handleApplySample = () => {
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

  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-slate-500" />
          {label}
        </span>
        <div className="flex items-center gap-2">
          {allowSample && (
            <button
              type="button"
              onClick={handleApplySample}
              className="text-[10px] font-bold text-[#0B2545] hover:underline"
            >
              Apply Sample
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-0.5"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Clear
          </button>
        </div>
      </div>

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
