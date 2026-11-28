'use client';

import React, { useEffect, useState } from 'react';
import { Phone, Search, UserPlus, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { displayRank } from '@/core/domain/ranks';
import type { DirectoryOfficer, LocalOfficerRecord } from '@/modules/deployment/local-officers.repository';

export type LocalSlot = { zone: string; sector: string; subSector: string | null };

/** Most Local Officers per place (same limit as the server). */
const MAX_LOCAL_OFFICERS = 6;

/**
 * One place's Local Officers: contacts printed on duty passports below the incharges. Anyone in the personnel
 * directory can be added (even an incharge elsewhere), several per place. A sub-sector without its own uses the sector's.
 */
export function LocalOfficerLine({ slot, current, inherited, onChange }: {
  slot: LocalSlot;
  current: LocalOfficerRecord[];
  /** The sector's Local Officers, shown for a sub-sector that has none of its own. */
  inherited?: LocalOfficerRecord[];
  onChange: (slot: LocalSlot, action: 'add' | 'remove', passId: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = async (action: 'add' | 'remove', passId: string) => {
    setBusy(true);
    // On failure the panel shows the error and the search stays open.
    try { await onChange(slot, action, passId); if (action === 'add') setPicking(false); } catch { /* shown by the panel */ } finally { setBusy(false); }
  };
  const fromSector = !current.length && Boolean(inherited?.length);
  const shown = current.length ? current : inherited ?? [];
  const full = current.length >= MAX_LOCAL_OFFICERS;

  return (
    <div className="mt-2 rounded-lg border border-dashed border-sky-300 bg-sky-50/60 px-2.5 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">
            Local Officer{shown.length > 1 ? 's' : ''}{fromSector && <span className="ml-1 font-medium normal-case tracking-normal text-slate-500">(from the sector)</span>}
          </p>
          {shown.length ? (
            <ul className="mt-0.5 space-y-0.5">
              {shown.map(item => (
                <li key={item.pass_id} className="flex items-center gap-1.5">
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-900">{displayRank(item.rank)} {item.full_name}</span>
                    <span className="ml-1 text-xs text-slate-600">{item.mobile_number || 'no mobile'}</span>
                  </span>
                  {!fromSector && (
                    <button type="button" disabled={busy} onClick={() => change('remove', item.pass_id)}
                      aria-label={`Remove ${item.full_name} as Local Officer`} title="Remove"
                      className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-500">Not attached</p>}
        </div>
        <PillButton type="button" size="sm" variant="outline" disabled={busy || full} icon={<UserPlus aria-hidden="true" className="size-3.5" />}
          onClick={() => setPicking(value => !value)} title={full ? `At most ${MAX_LOCAL_OFFICERS} per place` : undefined}>
          {fromSector ? 'Set own' : current.length ? 'Add another' : 'Add'}
        </PillButton>
      </div>
      {picking && <DirectoryPicker busy={busy} exclude={current.map(item => item.pass_id)}
        onCancel={() => setPicking(false)} onPick={id => change('add', id)} />}
    </div>
  );
}

/** Search the whole personnel directory by name, G.No. or mobile and pick one officer. */
function DirectoryPicker({ busy, exclude, onPick, onCancel }: { busy: boolean; exclude: string[]; onPick: (id: string) => void; onCancel: () => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<DirectoryOfficer[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const value = term.trim();
    if (value.length < 2) { setResults(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/deployment/local-officers?q=${encodeURIComponent(value)}`, { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not search the directory.');
          setError('');
          setResults(data.officers);
        })
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [term]);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-2">
        <span className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={term} onChange={event => setTerm(event.target.value)} aria-label="Search the personnel directory"
            placeholder="Search any officer: name, G.No. or mobile"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20" />
        </span>
        <button type="button" onClick={onCancel} aria-label="Close search" className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
          <X className="size-4" />
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {results === null && !error && <p className="px-1 text-xs text-slate-500">Type at least 2 letters or digits.</p>}
      {results && !results.length && <p className="px-1 text-sm text-slate-500">No officer matches.</p>}
      {results && results.length > 0 && (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {results.map(officer => (
            <li key={officer.id}>
              <button type="button" disabled={busy || exclude.includes(officer.id)} onClick={() => onPick(officer.id)}
                title={exclude.includes(officer.id) ? 'Already a Local Officer here' : undefined}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sky-50 disabled:opacity-50">
                <span className="w-16 shrink-0 text-xs font-semibold text-police-navy">{displayRank(officer.rank)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{officer.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    G.No. {officer.police_id_number || '-'} · {officer.mobile_number || 'no mobile'} · {officer.district || '-'}
                    {officer.police_zone ? ` · ${officer.police_zone}${officer.police_sector_number ? ` ${officer.police_sector_number}` : ''}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
