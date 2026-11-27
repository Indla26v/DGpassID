'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, IdCard, Pencil, Plus, Send } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { describeTargets } from '@/core/domain/duty-instructions';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { InstructionEditorDialog } from './InstructionEditorDialog';
import { PassportPrintDialog } from './PassportPrintDialog';
import { BackSideList, InstructionTable } from './InstructionTable';

export const formatIst = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value)) : '';

/** SP: create, edit, withdraw and print duty instructions sent to zone / sector logins. */
export function InstructionsManager() {
  const [instructions, setInstructions] = useState<DutyInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<DutyInstruction | null | 'new'>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [passports, setPassports] = useState<DutyInstruction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/deployment/instructions', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the instructions.');
      setInstructions(data.instructions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the instructions.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const withdraw = async (id: string) => {
    setError('');
    const response = await fetch(`/api/deployment/instructions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }),
    });
    const data = await response.json().catch(() => ({}));
    setConfirmWithdraw(null);
    if (!response.ok) { setError(data.error || 'Could not withdraw the instruction.'); return; }
    setNotice(`"${data.instruction.title}" withdrawn. Zone logins no longer see it.`);
    void load();
  };

  return (
    <section aria-label="Duty instructions" className="operations-panel operations-enter space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-police-navy">Duty instructions</h2>
          <p className="text-xs text-slate-500">Zone and sector logins can view them and print the passports.</p>
        </div>
        <PillButton type="button" variant="crimson" size="sm" icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => { setNotice(''); setEditing('new'); }}>
          New instruction
        </PillButton>
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <ul className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
        {instructions.map(item => {
          const active = item.status === 'ACTIVE';
          return (
            <li key={item.id} className={`rounded-2xl border ${active ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'} p-3`}>
              <div className="flex flex-wrap items-start gap-2">
                <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {active ? 'Sent' : 'Withdrawn'}
                    </span>
                    {item.version > 1 && <span className="rounded-full bg-blue-100 px-2 py-px text-[11px] font-semibold text-blue-800">Updated · v{item.version}</span>}
                  </span>
                  <span className="block text-xs text-slate-600">To: {describeTargets(item.targets)}</span>
                  <span className="block text-xs text-slate-500">
                    {active ? 'Updated' : 'Withdrawn'} {formatIst(active ? item.updated_at : item.withdrawn_at)} by {item.updated_by}
                    {item.version > 1 && item.revision_note ? ` · "${item.revision_note}"` : ''}
                  </span>
                </button>
                <span className="flex flex-wrap gap-1.5">
                  <a href={`/api/deployment/instructions/${item.id}/pdf`} target="_blank" rel="noopener"
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <FileText aria-hidden="true" className="size-3.5" /> PDF
                  </a>
                  {active && (
                    <>
                      <PillButton type="button" size="sm" variant="outline" icon={<IdCard aria-hidden="true" className="size-3.5" />} onClick={() => setPassports(item)}>Duty passports</PillButton>
                      <PillButton type="button" size="sm" variant="outline" icon={<Pencil aria-hidden="true" className="size-3.5" />} onClick={() => { setNotice(''); setEditing(item); }}>Edit</PillButton>
                      {confirmWithdraw === item.id ? (
                        <>
                          <PillButton type="button" size="sm" variant="danger" onClick={() => withdraw(item.id)}>Confirm withdraw</PillButton>
                          <PillButton type="button" size="sm" variant="ghost" onClick={() => setConfirmWithdraw(null)}>Keep</PillButton>
                        </>
                      ) : (
                        <PillButton type="button" size="sm" variant="ghost" icon={<Ban aria-hidden="true" className="size-3.5" />} onClick={() => setConfirmWithdraw(item.id)}>Withdraw</PillButton>
                      )}
                    </>
                  )}
                </span>
              </div>
              {open === item.id && (
                <div className="mt-3 rounded-2xl border border-slate-100 p-3">
                  <InstructionTable heading={item.heading} closing={item.closing} entries={item.entries} />
                  <div className="mt-3"><BackSideList title={item.back_title} points={item.back_points ?? []} /></div>
                </div>
              )}
            </li>
          );
        })}
        {!loading && !instructions.length && (
          <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            <Send aria-hidden="true" className="mx-auto mb-2 size-5 text-slate-400" />
            No instructions yet. Use <span className="font-semibold">New instruction</span> to save one for the zones.
          </li>
        )}
      </ul>

      {passports && <PassportPrintDialog instruction={passports} onClose={() => setPassports(null)} />}

      {editing && (
        <InstructionEditorDialog
          instruction={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setEditing(null);
            setNotice(editing === 'new' ? `"${saved.title}" saved for ${describeTargets(saved.targets)}. Print the passports from the list.` : `"${saved.title}" updated (version ${saved.version}).`);
            void load();
          }}
        />
      )}
    </section>
  );
}
