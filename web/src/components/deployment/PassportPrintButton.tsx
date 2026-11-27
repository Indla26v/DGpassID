'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';

interface OfficerInstruction { id: string; title: string; version: number }

const passportUrl = (instructionId: string, passId: string) =>
  `/api/deployment/instructions/${instructionId}/passports?ids=${encodeURIComponent(passId)}`;

/**
 * Prints one officer's duty passport. Finds the active duty instructions covering the officer's sector:
 * one opens its passport PDF at once, several give a short list to choose from, none explains why.
 */
export function PassportPrintButton({ passId, assigned, className, compact = false }: {
  passId: string;
  /** False when the officer has no zone / sector yet. */
  assigned: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<OfficerInstruction[] | null>(null);
  const [message, setMessage] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!choices && !message) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) { setChoices(null); setMessage(''); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [choices, message]);

  const open = async () => {
    setChoices(null);
    setMessage('');
    if (!assigned) { setMessage('Allot this officer to a zone and sector first.'); return; }
    // Opened now, while the click still counts, so the PDF is not blocked as a pop-up.
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const response = await fetch(`/api/deployment/instructions/for-officer?id=${encodeURIComponent(passId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not look up the duty instructions.');
      const found: OfficerInstruction[] = data.instructions ?? [];
      if (found.length === 1 && tab) {
        tab.location.href = passportUrl(found[0].id, passId);
        return;
      }
      tab?.close();
      if (found.length === 0) setMessage(data.reason || 'No duty instruction covers this officer yet.');
      else setChoices(found);
    } catch (error) {
      tab?.close();
      setMessage(error instanceof Error ? error.message : 'Could not look up the duty instructions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="relative inline-flex">
      <button type="button" onClick={open} disabled={busy}
        title="Print duty passport" aria-label="Print duty passport" aria-expanded={Boolean(choices || message)}
        className={className ?? 'inline-flex min-h-8 min-w-8 items-center justify-center gap-1 operations-action border border-police-crimson/40 px-2 text-xs font-semibold text-police-crimson hover:bg-rose-50 disabled:opacity-60'}>
        <BookOpen aria-hidden="true" className="size-3.5" />
        <span className={compact ? 'sr-only' : 'hidden xl:inline'}>{busy ? 'Opening…' : 'Passport'}</span>
      </button>
      {(choices || message) && (
        <div role="dialog" aria-label="Duty passport"
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 text-left text-xs shadow-lg">
          {message ? <p className="p-1.5 text-slate-700">{message}</p> : (
            <>
              <p className="px-1.5 pb-1.5 pt-1 font-semibold text-slate-600">Print the passport for which instruction?</p>
              <ul className="space-y-1">
                {choices!.map(item => (
                  <li key={item.id}>
                    <a href={passportUrl(item.id, passId)} target="_blank" rel="noopener noreferrer" onClick={() => setChoices(null)}
                      className="block rounded-lg px-2 py-1.5 font-medium text-police-navy hover:bg-slate-100">
                      {item.title} <span className="text-slate-500">· v{item.version}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
