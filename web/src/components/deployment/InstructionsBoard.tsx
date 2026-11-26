'use client';

import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { describeTargets } from '@/core/domain/duty-instructions';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { InstructionTable } from './InstructionTable';
import { formatIst } from './InstructionsManager';

/** Zone / sector login: duty instructions the SP sent to their area. View and print only. */
export function InstructionsBoard({ onCount }: { onCount?: (count: number) => void }) {
  const [instructions, setInstructions] = useState<DutyInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/deployment/instructions', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the instructions.');
        setInstructions(data.instructions);
        onCount?.(data.instructions.length);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onCount]);

  return (
    <section aria-label="Duty instructions" className="operations-enter space-y-3">
      <div className="operations-panel flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
        <div>
          <h2 className="text-base font-semibold text-police-navy">Duty instructions</h2>
          <p className="text-xs text-slate-500">Sent by the SP office to your zone or sector.</p>
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Refresh instructions"
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}

      {instructions.map(item => (
        <article key={item.id} className="operations-panel space-y-3 p-4 sm:p-5">
          <header className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-slate-900">
                {item.title}
                {item.version > 1 && <span className="rounded-full bg-blue-100 px-2 py-px text-[11px] font-semibold text-blue-800">Updated</span>}
              </h3>
              <p className="text-xs text-slate-500">
                {describeTargets(item.targets)} · {item.version > 1 ? 'Updated' : 'Sent'} {formatIst(item.updated_at)}
              </p>
              {item.version > 1 && item.revision_note && (
                <p className="mt-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs text-blue-900"><span className="font-semibold">What changed:</span> {item.revision_note}</p>
              )}
            </div>
            <a href={`/api/deployment/instructions/${item.id}/pdf`} target="_blank" rel="noopener"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-police-crimson px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-police-crimsonLight">
              <FileText aria-hidden="true" className="size-3.5" /> Print / PDF
            </a>
          </header>
          <InstructionTable heading={item.heading} closing={item.closing} entries={item.entries} />
        </article>
      ))}

      {!loading && !error && !instructions.length && (
        <p className="operations-panel p-6 text-center text-sm text-slate-500">No duty instructions for your area yet.</p>
      )}
    </section>
  );
}
