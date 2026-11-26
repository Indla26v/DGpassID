'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Plus, Send, Trash2, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import {
  DEFAULT_CLOSING, DEFAULT_HEADING, DEFAULT_INSTRUCTION_ENTRIES, MAX_ENTRIES, type InstructionEntry,
} from '@/core/domain/duty-instructions';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { InstructionTable } from './InstructionTable';

type Zone = (typeof POLICE_BANDOBUSHT_ZONES)[number];
const zoneLabel = (zone: Zone) => `Zone ${zone.number}: ${zone.name}`;
const sectorLabel = (sector: Zone['sectors'][number]) => `${sector.number}: ${sector.name}`;
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20';
const label = 'block text-xs font-semibold text-slate-700';

/** Create or edit a duty instruction and choose the zones (and optionally sectors) it goes to. */
export function InstructionEditorDialog({ instruction, onClose, onSaved }: {
  instruction: DutyInstruction | null;
  onClose: () => void;
  onSaved: (saved: DutyInstruction) => void;
}) {
  const editing = Boolean(instruction);
  const [title, setTitle] = useState(instruction?.title ?? '');
  const [heading, setHeading] = useState(instruction?.heading ?? DEFAULT_HEADING);
  const [closing, setClosing] = useState(instruction?.closing ?? DEFAULT_CLOSING);
  const [entries, setEntries] = useState<InstructionEntry[]>(instruction?.entries.map(entry => ({ ...entry })) ?? DEFAULT_INSTRUCTION_ENTRIES.map(entry => ({ ...entry })));
  const initialTargets = instruction?.targets ?? [];
  const allZones = !instruction || POLICE_BANDOBUSHT_ZONES.every(zone => initialTargets.some(target => target.zone === zone.name && target.sector === null));
  const [zoneNames, setZoneNames] = useState<string[]>(allZones ? [] : [...new Set(initialTargets.map(target => target.zone))]);
  const [sectorNumbers, setSectorNumbers] = useState<string[]>(
    !allZones && new Set(initialTargets.map(target => target.zone)).size === 1 ? initialTargets.filter(target => target.sector).map(target => target.sector as string) : [],
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const singleZone = zoneNames.length === 1 ? POLICE_BANDOBUSHT_ZONES.find(zone => zone.name === zoneNames[0]) : undefined;
  const targets: PolicePrintScope[] = !zoneNames.length
    ? POLICE_BANDOBUSHT_ZONES.map(zone => ({ zone: zone.name, sector: null }))
    : singleZone && sectorNumbers.length
      ? sectorNumbers.map(sector => ({ zone: singleZone.name, sector }))
      : zoneNames.map(zone => ({ zone, sector: null }));

  const update = (index: number, key: keyof InstructionEntry, value: string) =>
    setEntries(previous => previous.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  const move = (index: number, by: number) => setEntries(previous => {
    const next = [...previous];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    return next;
  });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { title, heading, closing, entries, targets, ...(editing ? { revisionNote: note } : {}) };
      const response = await fetch(editing ? `/api/deployment/instructions/${instruction!.id}` : '/api/deployment/instructions', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the instruction.');
      onSaved(data.instruction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the instruction.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="instruction-dialog-title" tabIndex={-1}
        onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 bg-police-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs text-slate-300">{editing ? `Edit duty instruction · version ${instruction!.version}` : 'New duty instruction'}</p>
            <h3 id="instruction-dialog-title" className="truncate text-lg font-semibold">{title || 'Untitled instruction'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-4 p-4 sm:p-5">
            <label className="block space-y-1">
              <span className={label}>Title</span>
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="e.g. Phase-I reporting instructions" className={field} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <span aria-hidden="true" className={label}>Send to zones</span>
                <MultiSelectDropdown ariaLabel="Send to zones" emptyLabel="All zones"
                  options={POLICE_BANDOBUSHT_ZONES.map(zoneLabel)}
                  value={POLICE_BANDOBUSHT_ZONES.filter(zone => zoneNames.includes(zone.name)).map(zoneLabel)}
                  onChange={labels => {
                    setZoneNames(POLICE_BANDOBUSHT_ZONES.filter(zone => labels.includes(zoneLabel(zone))).map(zone => zone.name));
                    setSectorNumbers([]);
                  }} />
              </div>
              <div className="min-w-0 space-y-1">
                <span aria-hidden="true" className={label}>Sectors <span className="font-normal text-slate-500">(optional)</span></span>
                {singleZone ? (
                  <MultiSelectDropdown ariaLabel="Send to sectors" emptyLabel="All sectors of the zone"
                    options={singleZone.sectors.map(sectorLabel)}
                    value={singleZone.sectors.filter(sector => sectorNumbers.includes(sector.number)).map(sectorLabel)}
                    onChange={labels => setSectorNumbers(singleZone.sectors.filter(sector => labels.includes(sectorLabel(sector))).map(sector => sector.number))} />
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                    {zoneNames.length > 1 ? 'Whole zones. Pick one zone to choose sectors.' : 'Pick one zone to choose sectors.'}
                  </p>
                )}
              </div>
            </div>

            <label className="block space-y-1">
              <span className={label}>Heading</span>
              <textarea value={heading} onChange={event => setHeading(event.target.value)} rows={2} maxLength={2000} className={field} />
            </label>

            <fieldset className="space-y-2">
              <legend className={label}>Report entities</legend>
              {entries.map((entry, index) => (
                <div key={index} className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-start gap-2 rounded-2xl border border-slate-200 p-2">
                  <span className="pt-2 text-center text-xs font-semibold text-slate-500">{index + 1}</span>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.2fr)_9.5rem_6.5rem]">
                    <input aria-label={`Row ${index + 1} report entity`} value={entry.entity} onChange={event => update(index, 'entity', event.target.value)}
                      placeholder="Report entity" maxLength={300} className={field} />
                    <input aria-label={`Row ${index + 1} date`} type="date" value={entry.date} onChange={event => update(index, 'date', event.target.value)} className={field} />
                    <input aria-label={`Row ${index + 1} time`} type="time" value={entry.time} onChange={event => update(index, 'time', event.target.value)} className={field} />
                    <input aria-label={`Row ${index + 1} place`} value={entry.place} onChange={event => update(index, 'place', event.target.value)}
                      placeholder="Place" maxLength={300} className={`${field} sm:col-span-3`} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button type="button" aria-label={`Move row ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}
                      className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                    <button type="button" aria-label={`Move row ${index + 1} down`} disabled={index === entries.length - 1} onClick={() => move(index, 1)}
                      className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                    <button type="button" aria-label={`Remove row ${index + 1}`} disabled={entries.length === 1} onClick={() => setEntries(previous => previous.filter((_, i) => i !== index))}
                      className="grid size-7 place-items-center rounded-full text-rose-700 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              ))}
              <PillButton type="button" size="sm" variant="outline" disabled={entries.length >= MAX_ENTRIES}
                icon={<Plus aria-hidden="true" className="size-3.5" />}
                onClick={() => setEntries(previous => [...previous, { entity: '', date: '', time: '', place: '' }])}>
                Add row
              </PillButton>
            </fieldset>

            <label className="block space-y-1">
              <span className={label}>Closing</span>
              <textarea value={closing} onChange={event => setClosing(event.target.value)} rows={2} maxLength={2000} className={field} />
            </label>

            {editing && (
              <label className="block space-y-1">
                <span className={label}>What changed? <span className="font-normal text-slate-500">(shown to zone logins)</span></span>
                <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="e.g. Briefing moved to 15:30" className={field} />
              </label>
            )}
          </div>

          <aside aria-label="Preview" className="space-y-2 border-t border-slate-200 bg-slate-50 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview as zone logins see it</p>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <InstructionTable compact heading={heading.trim()} closing={closing.trim()}
                entries={entries.filter(entry => entry.entity.trim() || entry.date || entry.time || entry.place.trim())} />
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          {error ? <p role="alert" className="mr-auto text-sm text-rose-800">{error}</p> : <span className="mr-auto" />}
          <PillButton type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</PillButton>
          <PillButton type="button" variant="crimson" onClick={save} disabled={busy || !title.trim() || (editing && !note.trim())}
            icon={<Send aria-hidden="true" className="size-4" />}>
            {busy ? 'Saving…' : editing ? 'Save and resend' : 'Send instruction'}
          </PillButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
