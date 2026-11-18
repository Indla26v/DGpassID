'use client';

import { useDialog } from './useDialog';
import React, { useRef, useState, useEffect } from 'react';
import { PillButton } from './PillButton';
import { Camera, RotateCcw, CheckCircle, X, AlertCircle } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (dataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const dialogRef = useDialog(isOpen, onClose);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize and stop camera stream
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
      setIsReady(false);
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsReady(false);
      setCapturedImage(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setIsReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please enable camera access in your browser.'
          : `Camera error: ${err.message || 'No camera device found.'}`
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    // Standard portrait ratio (3:4 or 4:5) for ID card passport photo
    // Crop center square/portrait
    const cropWidth = Math.min(width, Math.round(height * 0.8));
    const cropHeight = Math.round(cropWidth * 1.25);
    const startX = Math.max(0, (width - cropWidth) / 2);
    const startY = Math.max(0, (height - cropHeight) / 2);

    canvas.width = 300;
    canvas.height = 375;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      video,
      startX,
      startY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onPhotoCaptured(capturedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Capture cardholder photo" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#8B1A1A] flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Live Cardholder Photo Capture
              </h2>
              <p className="text-[11px] text-slate-300">
                Official badge photo acquisition station
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

        {/* Viewport Area */}
        <div className="p-5 flex flex-col items-center space-y-4">
          {cameraError ? (
            <div className="w-full p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col items-center text-center gap-2">
              <AlertCircle className="w-6 h-6 text-rose-600" />
              <span className="font-bold">{cameraError}</span>
              <p className="text-[11px] text-rose-700">
                You can alternatively upload a photo directly using the Browse File button.
              </p>
              <PillButton variant="secondary" size="sm" onClick={startCamera}>
                Retry Camera
              </PillButton>
            </div>
          ) : capturedImage ? (
            /* Review Captured Photo */
            <div className="flex flex-col items-center space-y-3">
              <div className="relative w-48 h-60 rounded-2xl border-2 border-[#0B2545] overflow-hidden shadow-lg bg-slate-100">
                <img
                  src={capturedImage}
                  alt="Captured Cardholder Photo"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
                  Captured OK
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Photo formatted for 9cm × 12cm Duty Access Pass
              </p>
            </div>
          ) : (
            /* Live Camera Stream with Passport Guide Frame */
            <div className="relative w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-300 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />

              {/* Passport Face Guide Oval Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-40 h-52 rounded-[50%/60%] border-2 border-dashed border-white/70 shadow-xs" />
                <span className="absolute bottom-3 text-white text-[10px] font-bold bg-black/50 px-2 py-0.5 rounded-full">
                  Align face within frame
                </span>
              </div>

              {!isReady && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Connecting camera...</span>
                </div>
              )}
            </div>
          )}

          {/* Hidden Canvas for capture processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Action Controls */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <PillButton variant="secondary" onClick={onClose}>
            Cancel
          </PillButton>

          {capturedImage ? (
            <div className="flex items-center gap-2">
              <PillButton
                variant="outline"
                onClick={handleRetake}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Retake
              </PillButton>
              <PillButton
                variant="crimson"
                onClick={handleConfirm}
                icon={<CheckCircle className="w-3.5 h-3.5" />}
              >
                Use Photo
              </PillButton>
            </div>
          ) : (
            <PillButton
              variant="crimson"
              onClick={handleCapture}
              disabled={!isReady || Boolean(cameraError)}
              icon={<Camera className="w-4 h-4" />}
            >
              Take Photo
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
};
