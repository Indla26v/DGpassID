'use client';

import React, { useEffect, useState } from 'react';
import { Ban, FileText, IdCard, Pencil, Plus, RefreshCw } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { describeTargets } from '@/core/domain/duty-instructions';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { BackSideList, InstructionTable } from './InstructionTable';
import { InstructionEditorDialog } from './InstructionEditorDialog';
import { formatIst } from './InstructionsManager';
import { PassportPrintDialog } from './PassportPrintDialog';

/**
 * Zone / sector login: duty instructions for their area, from the SP office or created by this login.
 * They can create their own (for their own zones and sectors only), edit or withdraw those, and print passports.
 */
export function InstructionsBoard({ onCount, scope, userEmail }: {
  onCount?: (count: number) => void;
  scope: PolicePrintScope[];
  userEmail: string;
}) {
  const [instructions, setInstructions] = useState<DutyInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [passports, setPassports] = useState<DutyInstruction | null>(null);
  const [editing, setEditing] = useState<DutyInstruction | null | 'new'>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const isMine = (item: DutyInstruction) => item.created_by.toLowerCase() === userEmail.toLowerCase();

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

  const withdraw = async (item: DutyInstruction) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/deployment/instructions/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not withdraw the instruction.');
      setNotice(`"${item.title}" withdrawn.`);
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw the instruction.');
    } finally {
      setConfirmWithdraw(null);
    }
  };

  return (
    <section aria-label="Duty instructions" className="operations-enter space-y-3">
      <div className="operations-panel flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <div className="mr-auto">
          <h2 className="text-base font-semibold text-police-navy">Duty instructions</h2>
          <p className="text-xs text-slate-500">From the SP office, and your own for your zone or sectors. Print duty passports from any of them.</p>
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Refresh instructions"
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <PillButton type="button" variant="crimson" size="sm" disabled={!scope.length} icon={<Plus aria-hidden="true" className="size-4" />}
          onClick={() => { setNotice(''); setEditing('new'); }}>
          New instruction
        </PillButton>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

      {instructions.map(item => {
        const mine = isMine(item);
        return (
          <article key={item.id} className="operations-panel space-y-3 p-4 sm:p-5">
            <header className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-slate-900">
                  {item.title}
                  {mine && <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] font-semibold text-emerald-800">Yours</span>}
                  {item.version > 1 && <span className="rounded-full bg-blue-100 px-2 py-px text-[11px] font-semibold text-blue-800">Updated</span>}
                </h3>
                <p className="text-xs text-slate-500">
                  {describeTargets(item.targets)} · {item.version > 1 ? 'Updated' : 'Sent'} {formatIst(item.updated_at)}
                  {!mine && ` · from ${item.creator_name || 'the SP office'}`}
                </p>
                {item.version > 1 && item.revision_note && (
                  <p className="mt-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs text-blue-900"><span className="font-semibold">What changed:</span> {item.revision_note}</p>
                )}
              </div>
              <span className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setPassports(item)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                  <IdCard aria-hidden="true" className="size-3.5" /> Duty passports
                </button>
                <a href={`/api/deployment/instructions/${item.id}/pdf`} target="_blank" rel="noopener"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-police-crimson px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-police-crimsonLight">
                  <FileText aria-hidden="true" className="size-3.5" /> Print / PDF
                </a>
                {mine && (
                  <>
                    <PillButton type="button" size="sm" variant="outline" icon={<Pencil aria-hidden="true" className="size-3.5" />}
                      onClick={() => { setNotice(''); setEditing(item); }}>Edit</PillButton>
                    {confirmWithdraw === item.id ? (
                      <>
                        <PillButton type="button" size="sm" variant="danger" onClick={() => withdraw(item)}>Confirm withdraw</PillButton>
                        <PillButton type="button" size="sm" variant="ghost" onClick={() => setConfirmWithdraw(null)}>Keep</PillButton>
                      </>
                    ) : (
                      <PillButton type="button" size="sm" variant="ghost" icon={<Ban aria-hidden="true" className="size-3.5" />}
                        onClick={() => setConfirmWithdraw(item.id)}>Withdraw</PillButton>
                    )}
                  </>
                )}
              </span>
            </header>
            <InstructionTable heading={item.heading} closing={item.closing} entries={item.entries} />
            <BackSideList title={item.back_title} points={item.back_points ?? []} />
          </article>
        );
      })}

      {passports && <PassportPrintDialog instruction={passports} onClose={() => setPassports(null)} />}

      {editing && (
        <InstructionEditorDialog
          scope={scope}
          instruction={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setEditing(null);
            setNotice(editing === 'new' ? `"${saved.title}" saved for ${describeTargets(saved.targets)}. Print the passports from the list.` : `"${saved.title}" updated (version ${saved.version}).`);
            setReload(value => value + 1);
          }}
        />
      )}

      {!loading && !error && !instructions.length && (
        <p className="operations-panel p-6 text-center text-sm text-slate-500">
          No duty instructions for your area yet. Use <span className="font-semibold">New instruction</span> to create one for your officers.
        </p>
      )}
    </section>
  );
}
