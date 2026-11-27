'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, CircleAlert, CircleX, ScanLine } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { normalizeRank } from '@/core/domain/ranks';

type Outcome = 'ISSUED' | 'ALREADY_ISSUED' | 'NOT_PRINTED' | 'NOT_FOUND' | 'ERROR';
interface ScanOfficer {
  id: string; passNumber: string; name: string; rank: string | null; gNo: string | null;
  zone: string | null; sector: string | null; sectorName: string | null; photoUrl: string | null;
  issuedAt: string | null; issuedBy: string | null;
}
interface ScanResult { key: number; outcome: Outcome; message: string; officer?: ScanOfficer; at: Date }

const REPEAT_MS = 3000;
const tone: Record<Outcome, { box: string; text: string; label: string; Icon: typeof CheckCircle2 }> = {
  ISSUED: { box: 'border-emerald-300 bg-emerald-50', text: 'text-emerald-800', label: 'Issued now', Icon: CheckCircle2 },
  ALREADY_ISSUED: { box: 'border-amber-300 bg-amber-50', text: 'text-amber-900', label: 'Already issued', Icon: CircleAlert },
  NOT_PRINTED: { box: 'border-rose-300 bg-rose-50', text: 'text-rose-800', label: 'Not printed yet', Icon: CircleX },
  NOT_FOUND: { box: 'border-rose-300 bg-rose-50', text: 'text-rose-800', label: 'Not in your area / not found', Icon: CircleX },
  ERROR: { box: 'border-rose-300 bg-rose-50', text: 'text-rose-800', label: 'Could not issue', Icon: CircleX },
};

const posting = (officer: ScanOfficer) => {
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === officer.zone);
  const sector = zone?.sectors.find(item => item.number === officer.sector);
  return [zone ? `Zone ${zone.number}: ${zone.name}` : officer.zone, sector ? `${sector.number}: ${sector.name}` : officer.sector,
    officer.sectorName && officer.sectorName !== sector?.name ? officer.sectorName : null].filter(Boolean).join(' · ') || 'Not allotted';
};
const time = (value: Date | string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value));

function feedback(ok: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (ok ? 0.12 : 0.35));
      oscillator.onended = () => void context.close();
    }
    navigator.vibrate?.(ok ? 80 : [60, 60, 60]);
  } catch { /* sound and vibration are optional */ }
}

/** Scan a duty ID card or duty passport QR (camera or handheld scanner) to mark that officer's ID card as issued. */
export function ScanIssuePanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<{ payload: string; at: number }>({ payload: '', at: 0 });
  const busyRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [secure, setSecure] = useState(true);

  useEffect(() => {
    setSecure(window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia));
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(async (payload: string) => {
    const text = payload.trim();
    if (!text || busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.payload === text && now - lastRef.current.at < REPEAT_MS) return;
    lastRef.current = { payload: text, at: now };
    busyRef.current = true;
    setBusy(true);
    let result: ScanResult;
    try {
      const response = await fetch('/api/police-force/scan-issue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: text }),
      });
      const data = await response.json().catch(() => ({}));
      result = data.outcome
        ? { key: now, outcome: data.outcome, message: data.message, officer: data.officer, at: new Date() }
        : { key: now, outcome: 'ERROR', message: data.error || 'Could not issue the ID card.', at: new Date() };
    } catch {
      result = { key: now, outcome: 'ERROR', message: 'Network error. Scan again.', at: new Date() };
    }
    feedback(result.outcome === 'ISSUED');
    setResults(previous => [result, ...previous].slice(0, 20));
    busyRef.current = false;
    setBusy(false);
  }, []);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      canvasRef.current ??= document.createElement('canvas');
      let lastDecode = 0;
      const tick = (stamp: number) => {
        frameRef.current = requestAnimationFrame(tick);
        if (stamp - lastDecode < 150 || video.readyState < 2 || !video.videoWidth) return;
        lastDecode = stamp;
        const canvas = canvasRef.current!;
        const scale = Math.min(1, 720 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) void submit(code.data);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (error) {
      stopCamera();
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or use a handheld scanner below.'
        : name === 'NotFoundError' ? 'No camera found. Use a handheld scanner below.' : 'Could not start the camera.');
    }
  };

  const latest = results[0];
  const issuedCount = results.filter(item => item.outcome === 'ISSUED').length;

  return (
    <section aria-label="Scan and issue" className="operations-enter space-y-3">
      <div className="operations-panel flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
        <div>
          <h2 className="text-base font-semibold text-police-navy">Scan &amp; Issue</h2>
          <p className="text-xs text-slate-500">Scan the QR on an officer&apos;s duty ID card or duty passport to mark the ID card as issued.</p>
        </div>
        <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{issuedCount} issued this session</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="operations-panel space-y-3 p-3 sm:p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900">
            <video ref={videoRef} muted playsInline className={`size-full object-cover ${cameraOn ? '' : 'hidden'}`} />
            {cameraOn ? (
              <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
            ) : (
              <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-300">
                <span><ScanLine aria-hidden="true" className="mx-auto mb-2 size-8" />
                  {secure ? 'Start the camera and hold the QR code inside the frame.' : 'The camera needs a secure (HTTPS or localhost) address. Use a handheld scanner below.'}
                </span>
              </div>
            )}
          </div>
          {secure && (cameraOn
            ? <PillButton type="button" variant="outline" onClick={stopCamera} icon={<CameraOff aria-hidden="true" className="size-4" />}>Stop camera</PillButton>
            : <PillButton type="button" variant="crimson" onClick={startCamera} icon={<Camera aria-hidden="true" className="size-4" />}>Start camera</PillButton>)}
          {cameraError && <p role="alert" className="text-sm text-rose-800">{cameraError}</p>}

          <form onSubmit={event => { event.preventDefault(); const value = manual; setManual(''); lastRef.current = { payload: '', at: 0 }; void submit(value); inputRef.current?.focus(); }}
            className="space-y-1">
            <label htmlFor="scan-code" className="block text-xs font-semibold text-slate-700">Handheld scanner or typed code</label>
            <div className="flex gap-2">
              <input id="scan-code" ref={inputRef} value={manual} onChange={event => setManual(event.target.value)} autoComplete="off" maxLength={600}
                placeholder="Scan here (the scanner presses Enter)"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20" />
              <PillButton type="submit" variant="outline" disabled={busy || !manual.trim()}>Issue</PillButton>
            </div>
          </form>
        </div>

        <div className="space-y-3">
          <div aria-live="polite" className="operations-panel p-3 sm:p-4">
            {latest ? <ResultCard result={latest} /> : (
              <p className="p-6 text-center text-sm text-slate-500">{busy ? 'Checking…' : 'The result of each scan appears here.'}</p>
            )}
          </div>
          {results.length > 1 && (
            <div className="operations-panel p-3 sm:p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier scans</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {results.slice(1).map(item => {
                  const style = tone[item.outcome];
                  return (
                    <li key={item.key} className="flex items-center gap-2 py-1.5">
                      <style.Icon aria-hidden="true" className={`size-4 shrink-0 ${style.text}`} />
                      <span className="min-w-0 flex-1 truncate">{item.officer ? `${normalizeRank(item.officer.rank)} ${item.officer.name}` : item.message}</span>
                      <span className={`shrink-0 text-xs font-semibold ${style.text}`}>{style.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{time(item.at)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  const style = tone[result.outcome];
  const officer = result.officer;
  return (
    <div className={`flex gap-3 rounded-2xl border-2 p-3 ${style.box}`}>
      {officer?.photoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={officer.photoUrl} alt="" className="h-24 w-20 shrink-0 rounded-xl border border-white object-cover shadow-sm" />
        : <span aria-hidden="true" className="grid h-24 w-20 shrink-0 place-items-center rounded-xl bg-white/70"><style.Icon className={`size-8 ${style.text}`} /></span>}
      <div className="min-w-0 space-y-0.5">
        <p className={`flex items-center gap-1.5 text-lg font-bold ${style.text}`}><style.Icon aria-hidden="true" className="size-5" />{style.label}</p>
        {officer ? (
          <>
            <p className="text-base font-semibold text-slate-900">{normalizeRank(officer.rank)} {officer.name}</p>
            <p className="text-xs text-slate-700">G.No. {officer.gNo || '-'} · {officer.passNumber}</p>
            <p className="text-xs text-slate-700">{posting(officer)}</p>
            {result.outcome === 'ALREADY_ISSUED' && officer.issuedAt && (
              <p className="text-xs text-amber-900">Issued {time(officer.issuedAt)}{officer.issuedBy ? ` by ${officer.issuedBy}` : ''}</p>
            )}
            {result.outcome === 'NOT_PRINTED' && <p className="text-xs text-rose-800">Print the ID card first, then scan again.</p>}
          </>
        ) : <p className="text-sm text-slate-700">{result.message}</p>}
      </div>
    </div>
  );
}
