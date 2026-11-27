'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, CalendarCheck, Check, ChevronDown, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { limitedSubSectors, type PolicePrintScope } from '@/core/domain/police-print-scope';
import {
  DEFAULT_BACK_POINTS, DEFAULT_BACK_TITLE, DEFAULT_CLOSING, DEFAULT_HEADING, DEFAULT_INSTRUCTION_ENTRIES, displayDate, MAX_BACK_POINTS, MAX_ENTRIES,
  type InstructionEntry, type InstructionTarget,
} from '@/core/domain/duty-instructions';
import { DEFAULT_SIGNATORY_DESIGNATION } from '@/core/domain/duty-passport';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { PassportPreview } from './PassportPreview';

type Zone = (typeof POLICE_BANDOBUSHT_ZONES)[number];
const zoneLabel = (zone: Zone) => `Zone ${zone.number}: ${zone.name}`;
const sectorLabel = (sector: Zone['sectors'][number]) => `${sector.number}: ${sector.name}`;
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20';
const label = 'block text-xs font-semibold text-slate-700';
const hint = 'font-normal text-slate-500';
const iconButton = 'grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30';
const HOURS_PRESETS = ['06:00 AM - 10:00 PM', '05:00 PM - 11:00 AM', '24 hours'];
const PLACE_SUGGESTIONS = ['At assigned Point of Duty', 'Police Parade Grounds, Tirupati', 'Police Complex, Tirumala'];

function Step({ number, title, description, done, children }: {
  number: number; title: string; description?: string; done?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-start gap-3">
        <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-police-navy text-white'}`}>
          {done ? <Check className="size-4" /> : number}
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Create or edit a duty instruction (the reporting schedule and the duty passport details), with a live A4 preview.
 * `scope` limits the recipients to a zone / sector login's own area; without it (SP) every zone can be chosen.
 */
export function InstructionEditorDialog({ instruction, onClose, onSaved, scope }: {
  instruction: DutyInstruction | null;
  onClose: () => void;
  onSaved: (saved: DutyInstruction) => void;
  scope?: PolicePrintScope[];
}) {
  const editing = Boolean(instruction);
  const limited = Boolean(scope);
  const allowedZones = limited ? POLICE_BANDOBUSHT_ZONES.filter(zone => scope!.some(area => area.zone === zone.name)) : POLICE_BANDOBUSHT_ZONES;
  const wholeZone = (name: string) => !limited || scope!.some(area => area.zone === name && area.sector === null);
  const sectorsFor = (zone: Zone) => wholeZone(zone.name) ? zone.sectors
    : zone.sectors.filter(sector => scope!.some(area => area.zone === zone.name && area.sector === sector.number));
  /** Sub-sectors of a sector this login is limited to (null = the whole sector). */
  const onlySubs = (zoneName: string, sectorNumber: string) => (limited ? limitedSubSectors(scope!, zoneName, sectorNumber) : null);
  /** A whole sector as this login may send to it: the sector, or only its own sub-sectors. */
  const sectorArea = (zoneName: string, sectorNumber: string): InstructionTarget[] => {
    const subs = onlySubs(zoneName, sectorNumber);
    return subs ? subs.map(subSector => ({ zone: zoneName, sector: sectorNumber, subSector })) : [{ zone: zoneName, sector: sectorNumber }];
  };
  /** The whole of a zone that this login may send to: the zone itself, or just its own sectors / sub-sectors. */
  const areaOf = (zone: Zone): InstructionTarget[] => wholeZone(zone.name)
    ? [{ zone: zone.name, sector: null }] : sectorsFor(zone).flatMap(sector => sectorArea(zone.name, sector.number));
  const everything = allowedZones.flatMap(areaOf);
  const [title, setTitle] = useState(instruction?.title ?? '');
  const [heading, setHeading] = useState(instruction?.heading ?? DEFAULT_HEADING);
  const [closing, setClosing] = useState(instruction?.closing ?? DEFAULT_CLOSING);
  const [entries, setEntries] = useState<InstructionEntry[]>(instruction?.entries.map(entry => ({ ...entry })) ?? DEFAULT_INSTRUCTION_ENTRIES.map(entry => ({ ...entry })));
  const initialTargets = instruction?.targets ?? [];
  const allZones = !instruction || (everything.length === initialTargets.length &&
    everything.every(area => initialTargets.some(target => target.zone === area.zone && target.sector === area.sector
      && (target.subSector ?? null) === (area.subSector ?? null))));
  const [zoneNames, setZoneNames] = useState<string[]>(allZones ? [] : [...new Set(initialTargets.map(target => target.zone))]);
  const [sectorNumbers, setSectorNumbers] = useState<string[]>(
    !allZones && new Set(initialTargets.map(target => target.zone)).size === 1
      ? [...new Set(initialTargets.filter(target => target.sector).map(target => target.sector as string))] : [],
  );
  const [subSectors, setSubSectors] = useState<string[]>(
    initialTargets.filter(target => target.subSector).map(target => target.subSector as string),
  );
  const [passport, setPassport] = useState({
    duty_from: instruction?.duty_from ?? '',
    duty_to: instruction?.duty_to ?? '',
    duty_hours: instruction?.duty_hours ?? '',
    security_plan: instruction?.security_plan ?? '',
    place_of_duty: instruction?.place_of_duty ?? '',
    signatory: instruction?.signatory ?? '',
    batch: instruction?.batch ?? '',
  });
  const setPassportField = (key: keyof typeof passport, value: string) => setPassport(previous => ({ ...previous, [key]: value }));
  // Back side of the passport: new instructions start with the standard Brief Instructions.
  const [backTitle, setBackTitle] = useState(instruction ? instruction.back_title ?? '' : DEFAULT_BACK_TITLE);
  const [backPoints, setBackPoints] = useState<string[]>(instruction ? [...(instruction.back_points ?? [])] : [...DEFAULT_BACK_POINTS]);
  const updatePoint = (index: number, value: string) => setBackPoints(previous => previous.map((point, i) => (i === index ? value : point)));
  const movePoint = (index: number, by: number) => setBackPoints(previous => {
    const next = [...previous];
    const [point] = next.splice(index, 1);
    next.splice(index + by, 0, point);
    return next;
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authority, setAuthority] = useState<{ name: string; signatureUrl: string | null } | null>(null);
  const wordingChanged = heading !== DEFAULT_HEADING || closing !== DEFAULT_CLOSING || Boolean(passport.signatory.trim());
  const [wordingOpen, setWordingOpen] = useState(wordingChanged);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);
  // The SP's saved name and signature, shown in the preview's signature block.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/deployment/signature', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (data) setAuthority({ name: data.name ?? '', signatureUrl: data.signatureUrl ?? null }); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const singleZone = zoneNames.length === 1 ? allowedZones.find(zone => zone.name === zoneNames[0])
    : !zoneNames.length && allowedZones.length === 1 ? allowedZones[0] : undefined;
  const singleSector = singleZone && sectorNumbers.length === 1 ? singleZone.sectors.find(sector => sector.number === sectorNumbers[0]) : undefined;
  // Sub-sectors offered for the chosen sector: all of them, or only this login's own.
  const offeredSubSectors = singleSector?.subSectors?.filter(sub => !onlySubs(singleZone!.name, singleSector.number) || onlySubs(singleZone!.name, singleSector.number)!.includes(sub)) ?? [];
  const chosenSubSectors = offeredSubSectors.filter(sub => subSectors.includes(sub));
  const targets: InstructionTarget[] = singleZone && singleSector && chosenSubSectors.length
    ? chosenSubSectors.map(subSector => ({ zone: singleZone.name, sector: singleSector.number, subSector }))
    : singleZone && sectorNumbers.length
    ? sectorNumbers.flatMap(sector => sectorArea(singleZone.name, sector))
    : zoneNames.length ? allowedZones.filter(zone => zoneNames.includes(zone.name)).flatMap(areaOf) : everything;
  const filledEntries = entries.filter(entry => entry.entity.trim() || entry.date || entry.time || entry.place.trim());

  const update = (index: number, key: keyof InstructionEntry, value: string) =>
    setEntries(previous => previous.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  const move = (index: number, by: number) => setEntries(previous => {
    const next = [...previous];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    return next;
  });
  const fillEmptyDates = () => setEntries(previous => previous.map(entry => (entry.entity.trim() && !entry.date ? { ...entry, date: passport.duty_from } : entry)));
  const emptyDates = entries.filter(entry => entry.entity.trim() && !entry.date).length;

  // What is still needed before saving, shown in the footer.
  const missing = [
    !title.trim() && 'a title',
    !filledEntries.some(entry => entry.entity.trim()) && 'at least one report entity',
    editing && !note.trim() && 'what changed',
  ].filter(Boolean) as string[];
  const passportGaps = [!passport.duty_from && 'duty dates', !passport.place_of_duty.trim() && 'place of duty']
    .filter(Boolean) as string[];

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { title, heading, closing, entries, targets, ...passport, back_title: backTitle, back_points: backPoints,
        ...(editing ? { revisionNote: note } : {}) };
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
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-2 sm:p-4"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="instruction-dialog-title" tabIndex={-1}
        onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}
        className="flex h-[96dvh] w-full max-w-[1440px] flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 bg-police-navy px-5 py-3.5 text-white">
          <div className="min-w-0">
            <p className="text-xs text-slate-300">{editing ? `Edit duty instruction · version ${instruction!.version}` : 'New duty instruction and duty passport'}</p>
            <h3 id="instruction-dialog-title" className="truncate text-lg font-semibold">{title || 'Untitled instruction'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* Form */}
          <div className="space-y-3 bg-slate-50 p-3 sm:p-4 lg:overflow-y-auto">
            <Step number={1} title="Name and recipients" done={Boolean(title.trim())}
              description={limited ? 'Only your own zones and sectors. Officers posted there get the passports.' : 'Zone and sector logins in these areas can print the passports for their officers.'}>
              <label className="block space-y-1">
                <span className={label}>Title</span>
                <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="e.g. Phase-I duty instructions, 04-06 December" className={field} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <span aria-hidden="true" className={label}>For {limited && allowedZones.length === 1 ? 'zone' : 'zones'}</span>
                  {limited && allowedZones.length === 1 ? (
                    <p className="flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">{zoneLabel(allowedZones[0])}</p>
                  ) : (
                    <MultiSelectDropdown ariaLabel="For zones" emptyLabel={limited ? 'All my zones' : 'All zones'}
                      options={allowedZones.map(zoneLabel)}
                      value={allowedZones.filter(zone => zoneNames.includes(zone.name)).map(zoneLabel)}
                      onChange={labels => {
                        setZoneNames(allowedZones.filter(zone => labels.includes(zoneLabel(zone))).map(zone => zone.name));
                        setSectorNumbers([]);
                        setSubSectors([]);
                      }} />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <span aria-hidden="true" className={label}>Sectors <span className={hint}>(optional)</span></span>
                  {singleZone ? (
                    <MultiSelectDropdown ariaLabel="For sectors" emptyLabel={wholeZone(singleZone.name) ? 'All sectors of the zone' : 'All my sectors'}
                      options={sectorsFor(singleZone).map(sectorLabel)}
                      value={sectorsFor(singleZone).filter(sector => sectorNumbers.includes(sector.number)).map(sectorLabel)}
                      onChange={labels => {
                        setSectorNumbers(sectorsFor(singleZone).filter(sector => labels.includes(sectorLabel(sector))).map(sector => sector.number));
                        setSubSectors([]);
                      }} />
                  ) : (
                    <p className="flex min-h-10 items-center rounded-xl border border-dashed border-slate-300 bg-white px-3 text-xs text-slate-500">
                      {zoneNames.length > 1 ? 'Whole zones. Pick a single zone to choose sectors.' : 'Pick a single zone to choose sectors.'}
                    </p>
                  )}
                </div>
              </div>
              {singleSector?.subSectors?.length ? (
                <div className="min-w-0 space-y-1">
                  <span aria-hidden="true" className={label}>Sub-sectors of {singleSector.number} <span className={hint}>(optional)</span></span>
                  <MultiSelectDropdown ariaLabel={`For sub-sectors of ${singleSector.number}`} emptyLabel={onlySubs(singleZone!.name, singleSector.number) ? 'All my sub-sectors' : `Whole ${singleSector.number} (all sub-sectors)`}
                    options={offeredSubSectors} value={chosenSubSectors} onChange={setSubSectors} />
                  <p className="text-xs text-slate-500">
                    {chosenSubSectors.length
                      ? 'Passports are printed only for officers posted in these sub-sectors. Sector and zone logins still receive it.'
                      : 'Pick sub-sectors to make it only for the officers posted there.'}
                  </p>
                </div>
              ) : singleZone && sectorNumbers.length > 1 ? (
                <p className="text-xs text-slate-500">Pick a single sector to choose its sub-sectors.</p>
              ) : null}
            </Step>

            <Step number={2} title="Duty period and passport details" description="Printed in the passport header and officer box." done={!passportGaps.length}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={label}>Duty from</span>
                  <input type="date" value={passport.duty_from} onChange={event => setPassportField('duty_from', event.target.value)} className={field} />
                </label>
                <label className="block space-y-1">
                  <span className={label}>Duty to</span>
                  <input type="date" value={passport.duty_to} min={passport.duty_from || undefined} onChange={event => setPassportField('duty_to', event.target.value)} className={field} />
                </label>
              </div>
              <div className="space-y-1">
                <label htmlFor="duty-hours" className={label}>Duty hours / shift</label>
                <input id="duty-hours" value={passport.duty_hours} onChange={event => setPassportField('duty_hours', event.target.value)} maxLength={60} placeholder="e.g. 06:00 AM - 10:00 PM" className={field} />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {HOURS_PRESETS.map(preset => (
                    <button key={preset} type="button" onClick={() => setPassportField('duty_hours', preset)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${passport.duty_hours === preset ? 'border-police-navy bg-police-navy text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}>
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <label className="block space-y-1">
                  <span className={label}>Place of duty</span>
                  <input value={passport.place_of_duty} onChange={event => setPassportField('place_of_duty', event.target.value)} maxLength={120} placeholder="e.g. IISER Tirupati, Tirupati" className={field} />
                </label>
                <label className="block space-y-1">
                  <span className={label}>Batch <span className={hint}>(optional)</span></span>
                  <input value={passport.batch} onChange={event => setPassportField('batch', event.target.value)} maxLength={60} placeholder="e.g. Batch I" className={field} />
                </label>
              </div>
            </Step>

            <Step number={3} title="Reporting schedule" description="Each row is a line in the table: where and when officers report." done={filledEntries.some(entry => entry.entity.trim())}>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton type="button" size="sm" variant="outline" disabled={!passport.duty_from || !emptyDates} onClick={fillEmptyDates}
                  icon={<CalendarCheck aria-hidden="true" className="size-3.5" />}>
                  {passport.duty_from ? `Put ${displayDate(passport.duty_from)} in empty dates` : 'Set “Duty from” to fill dates'}
                </PillButton>
                <span className="text-xs text-slate-500">Blank cells print as “-”.</span>
              </div>
              <datalist id="instruction-places">
                {[...new Set([...PLACE_SUGGESTIONS, passport.place_of_duty.trim()].filter(Boolean))].map(place => <option key={place} value={place} />)}
              </datalist>
              <ol className="space-y-2">
                {entries.map((entry, index) => (
                  <li key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#b22222] ring-1 ring-slate-200">{index + 1}</span>
                      <input aria-label={`Row ${index + 1} report entity`} value={entry.entity} onChange={event => update(index, 'entity', event.target.value)}
                        placeholder="Report entity, e.g. Briefing" maxLength={300} className={`${field} font-semibold`} />
                      <span className="flex shrink-0">
                        <button type="button" aria-label={`Move row ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className={iconButton}><ArrowUp className="size-4" /></button>
                        <button type="button" aria-label={`Move row ${index + 1} down`} disabled={index === entries.length - 1} onClick={() => move(index, 1)} className={iconButton}><ArrowDown className="size-4" /></button>
                        <button type="button" aria-label={`Remove row ${index + 1}`} disabled={entries.length === 1}
                          onClick={() => setEntries(previous => previous.filter((_, i) => i !== index))}
                          className="grid size-8 place-items-center rounded-full text-rose-700 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="size-4" /></button>
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 pl-8 sm:grid-cols-[10rem_7.5rem_minmax(0,1fr)]">
                      <input aria-label={`Row ${index + 1} date`} type="date" value={entry.date} onChange={event => update(index, 'date', event.target.value)} className={field} />
                      <input aria-label={`Row ${index + 1} time`} type="time" value={entry.time} onChange={event => update(index, 'time', event.target.value)} className={field} />
                      <input aria-label={`Row ${index + 1} place`} value={entry.place} onChange={event => update(index, 'place', event.target.value)} list="instruction-places"
                        placeholder="Place" maxLength={300} className={field} />
                    </div>
                  </li>
                ))}
              </ol>
              <PillButton type="button" size="sm" variant="outline" disabled={entries.length >= MAX_ENTRIES}
                icon={<Plus aria-hidden="true" className="size-3.5" />}
                onClick={() => setEntries(previous => [...previous, { entity: '', date: '', time: '', place: '' }])}>
                Add row
              </PillButton>
            </Step>

            <Step number={4} title="Back side — Brief Instructions" done={backPoints.some(point => point.trim())}
              description="Printed on the back of every passport. Print the PDF double-sided (flip on long edge).">
              <label className="block space-y-1">
                <span className={label}>Title</span>
                <input value={backTitle} onChange={event => setBackTitle(event.target.value)} maxLength={200}
                  placeholder="e.g. Brief Instructions – SVBC Watch Tower, SD Mandapam" className={field} />
              </label>
              <ol className="space-y-2">
                {backPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-slate-500">{index + 1}.</span>
                    <textarea aria-label={`Back-side point ${index + 1}`} value={point} onChange={event => updatePoint(index, event.target.value)}
                      rows={2} maxLength={400} className={`${field} min-h-[2.75rem]`} />
                    <span className="flex shrink-0 flex-col">
                      <button type="button" aria-label={`Move point ${index + 1} up`} disabled={index === 0} onClick={() => movePoint(index, -1)} className={iconButton}><ArrowUp className="size-4" /></button>
                      <button type="button" aria-label={`Move point ${index + 1} down`} disabled={index === backPoints.length - 1} onClick={() => movePoint(index, 1)} className={iconButton}><ArrowDown className="size-4" /></button>
                      <button type="button" aria-label={`Remove point ${index + 1}`} onClick={() => setBackPoints(previous => previous.filter((_, i) => i !== index))}
                        className="grid size-8 place-items-center rounded-full text-rose-700 hover:bg-rose-50"><Trash2 className="size-4" /></button>
                    </span>
                  </li>
                ))}
              </ol>
              {!backPoints.length && <p className="text-xs text-slate-500">No back side: passports print on one side only.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <PillButton type="button" size="sm" variant="outline" disabled={backPoints.length >= MAX_BACK_POINTS}
                  icon={<Plus aria-hidden="true" className="size-3.5" />} onClick={() => setBackPoints(previous => [...previous, ''])}>
                  Add point
                </PillButton>
                <button type="button" onClick={() => { setBackTitle(DEFAULT_BACK_TITLE); setBackPoints([...DEFAULT_BACK_POINTS]); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-police-navy hover:underline">
                  <RotateCcw aria-hidden="true" className="size-3.5" /> Use the standard points
                </button>
                {backPoints.length > 0 && (
                  <button type="button" onClick={() => setBackPoints([])} className="text-xs font-semibold text-rose-700 hover:underline">No back side</button>
                )}
              </div>
            </Step>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => setWordingOpen(open => !open)} aria-expanded={wordingOpen}
                className="flex w-full items-center gap-3 p-4 text-left">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">5</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">Wording and signature <span className={hint}>(optional)</span></span>
                  <span className="block text-xs text-slate-500">{wordingChanged ? 'Changed from the standard wording.' : 'Standard heading, closing line and SP signature block.'}</span>
                </span>
                <ChevronDown aria-hidden="true" className={`size-4 text-slate-500 transition-transform ${wordingOpen ? 'rotate-180' : ''}`} />
              </button>
              {wordingOpen && (
                <div className="space-y-3 border-t border-slate-100 p-4 pt-3">
                  <label className="block space-y-1">
                    <span className={label}>Heading above the table</span>
                    <textarea value={heading} onChange={event => setHeading(event.target.value)} rows={2} maxLength={2000} className={field} />
                  </label>
                  <label className="block space-y-1">
                    <span className={label}>Closing line</span>
                    <textarea value={closing} onChange={event => setClosing(event.target.value)} rows={2} maxLength={2000} className={field} />
                  </label>
                  {limited ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Signed by the SP: <span className="font-semibold">{authority?.name || 'SP’s saved name'}</span>, {DEFAULT_SIGNATORY_DESIGNATION.join(' ')}, with the SP’s saved signature.
                    </p>
                  ) : (
                    <label className="block space-y-1">
                      <span className={label}>Signed by <span className={hint}>(blank = {authority?.name || 'SP’s saved name'}, {DEFAULT_SIGNATORY_DESIGNATION.join(' ')})</span></span>
                      <textarea value={passport.signatory} onChange={event => setPassportField('signatory', event.target.value)} rows={3} maxLength={200}
                        placeholder={'Name\nDesignation'} className={field} />
                    </label>
                  )}
                  {wordingChanged && (
                    <button type="button" onClick={() => { setHeading(DEFAULT_HEADING); setClosing(DEFAULT_CLOSING); setPassportField('signatory', ''); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-police-navy hover:underline">
                      <RotateCcw aria-hidden="true" className="size-3.5" /> Use the standard wording
                    </button>
                  )}
                </div>
              )}
            </section>

            {editing && (
              <Step number={6} title="What changed?" description="Required. Zone logins see this note with the Updated badge." done={Boolean(note.trim())}>
                <input aria-label="What changed" value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="e.g. Briefing moved to 15:30" className={field} />
              </Step>
            )}
          </div>

          {/* Live preview */}
          <aside aria-label="Preview" className="border-t border-slate-200 bg-slate-200/70 p-3 sm:p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <PassportPreview authority={authority}
              values={{ heading, closing, entries: filledEntries, targets, ...passport, back_title: backTitle, back_points: backPoints.filter(point => point.trim()) }} />
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <div className="mr-auto min-w-0 text-sm">
            {error ? <p role="alert" className="text-rose-800">{error}</p>
              : missing.length ? <p className="text-slate-600">Still needed: {missing.join(', ')}.</p>
                : passportGaps.length ? <p className="text-amber-800">Ready to save. For the passport, also set: {passportGaps.join(', ')}.</p>
                  : <p className="text-emerald-700">Ready to save.</p>}
          </div>
          <PillButton type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</PillButton>
          <PillButton type="button" variant="crimson" onClick={save} disabled={busy || missing.length > 0}
            icon={<Save aria-hidden="true" className="size-4" />}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save instruction'}
          </PillButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
