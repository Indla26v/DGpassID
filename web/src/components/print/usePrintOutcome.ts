'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toConferenceDate } from '@/core/domain/pass-validity';

type PrintSelection = { id: string; reason?: string } | { ids: string[] };
type PrintJob = PrintSelection & { confirmationId: string; printStartedAt: string };
type Phase = 'idle' | 'opening' | 'outcome' | 'saving';

function makeJob(selection: PrintSelection, printStartedAt: string): PrintJob {
  const confirmationId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { ...selection, confirmationId, printStartedAt };
}

async function sendPrintRequest<Result>(body: PrintSelection & {
  preview?: boolean;
  confirmationId?: string;
  printStartedAt?: string;
  expectedVersions?: Record<string, string>;
}): Promise<Result> {
  const response = await fetch('/api/print-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'The print station could not save the request.');
  }
  return response.json();
}

export function usePrintOutcome<Result>(
  onRecorded: (result: Result) => void,
) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [printDate, setPrintDate] = useState<string>();
  const phaseRef = useRef<Phase>('idle');
  const job = useRef<PrintJob | null>(null);
  const locked = phase !== 'idle';

  function moveTo(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    if (!locked) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [locked]);

  async function start(
    selection: PrintSelection,
    displayedPasses: readonly { id: string; updated_at: string }[],
    openPrint: () => Promise<void>,
  ) {
    if (phaseRef.current !== 'idle') return;
    moveTo('opening');
    setError('');
    try {
      const expectedVersions = Object.fromEntries(displayedPasses.map(pass => [pass.id, pass.updated_at]));
      const { printStartedAt } = await sendPrintRequest<{ printStartedAt: string }>({ ...selection, preview: true, expectedVersions });
      const date = toConferenceDate(printStartedAt);
      flushSync(() => setPrintDate(date));
      try {
        await openPrint();
      } finally {
        setPrintDate(undefined);
      }
      job.current = makeJob(selection, printStartedAt);
      moveTo('outcome');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open printing.');
      moveTo('idle');
    }
  }

  function dismiss() {
    if (phaseRef.current !== 'outcome') return;
    job.current = null;
    setError('');
    moveTo('idle');
  }

  async function confirm() {
    if (phaseRef.current !== 'outcome' || !job.current) return;
    moveTo('saving');
    setError('');
    let result: Result;
    try {
      result = await sendPrintRequest<Result>(job.current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save the print outcome.';
      setError(`${message} Select Printed again to retry saving.`);
      moveTo('outcome');
      return;
    }
    job.current = null;
    moveTo('idle');
    onRecorded(result);
  }

  function closeIfIdle(close: () => void) {
    if (phaseRef.current === 'idle') {
      setError('');
      close();
    }
  }

  const count = job.current && ('ids' in job.current ? job.current.ids.length : 1);
  return { phase, locked, count, error, printDate, start, dismiss, confirm, closeIfIdle };
}
