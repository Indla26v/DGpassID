'use client';

import '@/lib/client-safe-json';
import { useDialog } from './useDialog';
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PillButton } from './PillButton';
import { Camera, RotateCcw, CheckCircle, X, AlertCircle, Upload } from 'lucide-react';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

      let stream: MediaStream;
      try {
        // Try user-facing webcam
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        // Fallback to any available video input device
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.muted = true;

        video.onloadeddata = () => {
          setIsReady(true);
        };

        try {
          await video.play();
          setIsReady(true);
        } catch {
          // If auto-play blocked, onloadeddata will set ready
        }
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'No webcam detected on this workstation. You can upload an image file instead.'
          : `Camera unavailable: ${err.message || 'No video device found'}. You can upload a photo below.`
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
    if (!video) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    // Standard portrait ratio (3:4 or 4:5) for ID card passport photo
    const cropWidth = Math.min(width, Math.round(height * 0.8));
    const cropHeight = Math.round(cropWidth * 1.25);
    const startX = Math.max(0, (width - cropWidth) / 2);
    const startY = Math.max(0, (height - cropHeight) / 2);

    // Offscreen in-memory canvas (not mounted in DOM, preventing circular FiberNode serialization errors)
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 375;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror horizontally so capture matches mirror preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCapturedImage(result);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value to allow re-uploading the same file
    e.target.value = '';
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
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Capture cardholder photo"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-scaleUp">
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
            <div className="w-full p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col items-center text-center gap-2.5">
              <AlertCircle className="w-6 h-6 text-rose-600" />
              <span className="font-bold">{cameraError}</span>
              <p className="text-[11px] text-rose-700">
                You can select an existing photo file from this workstation.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <PillButton
                  variant="crimson"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload className="w-3.5 h-3.5" />}
                >
                  Upload Photo File
                </PillButton>
                <PillButton variant="secondary" size="sm" onClick={startCamera}>
                  Retry Camera
                </PillButton>
              </div>
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
                  Photo Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Calibrated for 8cm × 12cm Duty Access Pass
              </p>
            </div>
          ) : (
            /* Live Camera Stream with Passport Guide Frame */
            <div className="relative w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-300 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
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

          {/* Hidden File Input for fallback upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Action Controls */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-2">
              <PillButton
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload className="w-3.5 h-3.5" />}
              >
                Upload File
              </PillButton>
              <PillButton
                variant="crimson"
                onClick={handleCapture}
                disabled={!isReady || Boolean(cameraError)}
                icon={<Camera className="w-4 h-4" />}
              >
                Take Photo
              </PillButton>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
