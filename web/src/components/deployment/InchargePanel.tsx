'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, CornerDownRight, RefreshCw, Search, TriangleAlert, UserCheck, UserPlus, Wand2, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { displayRank, rankSeniority } from '@/core/domain/ranks';
import { isSeniorRank, SUB_SECTOR_OFFICERS, topRankOfficers } from '@/core/domain/duty-passport';
import type { DeploymentOfficer } from '@/modules/deployment/deployment.repository';
import type { InchargeRecord } from '@/modules/deployment/incharges.repository';
import type { LocalOfficerRecord } from '@/modules/deployment/local-officers.repository';
import { LocalOfficerLine, type LocalSlot } from './LocalOfficerLine';

type Zone = (typeof POLICE_BANDOBUSHT_ZONES)[number];
/** A place to allot: a sub-sector, or (subSector null) a sector that has no sub-sectors. */
type Slot = { zone: string; sector: string; subSector: string | null };
const keyOf = (slot: Slot) => `${slot.zone}|${slot.sector}|${slot.subSector ?? ''}`;
const MAX_SHOWN = 60;
const ordinal = (slot: Slot, index: number) => (index === 0 ? (slot.subSector ? 'Sub-sector Incharge' : 'Sector Incharge') : index === 1 ? '2nd' : '3rd');
/** "1(A) IISER main gate and inside" -> ["1(A)", "IISER main gate and inside"]. */
const splitSub = (name: string): [string, string] => {
  const match = /^(\d+\s*\([A-Z]\))\s*(.*)$/i.exec(name.trim());
  return match ? [match[1].replace(/\s+/g, ''), match[2]] : ['', name];
};
/** Allotted officers keep printing while they stay in the same zone; they may come from another sector of it. */
const stillPosted = (row: InchargeRecord) => row.posted_zone === row.zone;
const postedHere = (row: InchargeRecord) => row.posted_sector === row.sector && (!row.sub_sector || row.posted_sector_name === row.sub_sector);

/**
 * SP only: allot up to 3 officers per sub-sector (1st = Sub-sector Incharge) and, for sectors without sub-sectors,
 * per sector (1st = Sector Incharge), printed on duty passports. A sector with sub-sectors is a heading only:
 * its Sector Incharge is always the senior-most officer posted there.
 */
export function InchargePanel() {
  const [incharges, setIncharges] = useState<InchargeRecord[]>([]);
  const [seniors, setSeniors] = useState<Record<string, number>>({});
  const [localOfficers, setLocalOfficers] = useState<LocalOfficerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const zones = POLICE_BANDOBUSHT_ZONES;
  const [open, setOpen] = useState<Set<string>>(() => new Set(zones.slice(0, 1).map(zone => zone.name)));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/deployment/incharges', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the allotments.');
        setIncharges(data.incharges);
        setSeniors(data.seniorCounts ?? {});
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetch('/api/deployment/local-officers', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the Local Officers.');
        setLocalOfficers(data.localOfficers);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [reload]);

  // Local Officer per sector ('' sub-sector) and per sub-sector.
  const localByKey = useMemo(() => {
    const map = new Map<string, LocalOfficerRecord[]>();
    for (const item of localOfficers) {
      const key = `${item.zone}|${item.sector}|${item.sub_sector ?? ''}`;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [localOfficers]);
  const saveLocal = useCallback(async (slot: LocalSlot, action: 'add' | 'remove', passId: string) => {
    setError('');
    setNotice('');
    const place = slot.subSector ? `${slot.sector} · ${splitSub(slot.subSector)[0] || slot.subSector}` : slot.sector;
    try {
      const response = await fetch('/api/deployment/local-officers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...slot, passId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the Local Officer.');
      setNotice(action === 'add' ? `${slot.zone} ${place}: Local Officer added.` : `${slot.zone} ${place}: Local Officer removed.`);
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the Local Officer.');
      throw err;
    }
  }, []);
  const localLine = (slot: LocalSlot) => (
    <LocalOfficerLine slot={slot} current={localByKey.get(`${slot.zone}|${slot.sector}|${slot.subSector ?? ''}`) ?? []}
      inherited={slot.subSector ? localByKey.get(`${slot.zone}|${slot.sector}|`) : undefined}
      onChange={saveLocal} />
  );

  const bySlot = useMemo(() => {
    const map = new Map<string, InchargeRecord[]>();
    for (const row of incharges) {
      if (!row.sector) continue;
      const key = keyOf({ zone: row.zone, sector: row.sector, subSector: row.sub_sector ?? null });
      map.set(key, [...(map.get(key) ?? []), row].sort((a, b) => a.position - b.position));
    }
    return map;
  }, [incharges]);

  const save = useCallback(async (slot: Slot, passIds: string[], label: string) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/incharges', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...slot, passIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the allotment.');
      setNotice(passIds.length ? `${label}: ${passIds.length} officer${passIds.length === 1 ? '' : 's'} allotted.` : `${label}: allotment removed.`);
      setPicking(null);
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the allotment.');
    }
  }, []);

  const autoAllot = async () => {
    setAutoBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/incharges', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auto' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not auto allot.');
      setNotice(`Auto allotted ${data.filled} place${data.filled === 1 ? '' : 's'}. ${data.kept} already allotted were kept`
        + `${data.withoutSeniorOfficers ? `; ${data.withoutSeniorOfficers} have no officers of SI rank or above yet` : ''}.`);
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not auto allot.');
    } finally {
      setAutoBusy(false);
      setConfirmAuto(false);
    }
  };

  const row = (slot: Slot, sectorName: string) => {
    const key = keyOf(slot);
    const current = bySlot.get(key) ?? [];
    const isPicking = picking !== null && keyOf(picking) === key;
    const [number, name] = slot.subSector ? splitSub(slot.subSector) : [slot.sector, sectorName];
    const label = slot.subSector ? `Sub-sector ${number || name}` : `${slot.sector}`;
    return (
      <li key={key} className={`rounded-xl border border-slate-200 p-3 ${slot.subSector ? 'ml-4 bg-slate-50/70 sm:ml-8' : 'bg-white'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-[1_1_14rem] items-start gap-2">
            {slot.subSector && <CornerDownRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{slot.subSector ? `Sub-sector${number ? ` · ${number}` : ''}` : slot.sector}</p>
              <p className="text-sm font-medium leading-snug text-slate-800">{name}</p>
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_16rem]">
            {current.length ? (
              <ol className="space-y-1">
                {current.map((item, index) => (
                  <li key={item.pass_id} className="flex items-start gap-2 text-sm">
                    <UserCheck aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${index === 0 ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ordinal(slot, index)}</span>
                      <span className="font-semibold text-slate-900">{displayRank(item.rank)} {item.full_name}</span>
                      <span className="ml-1 text-xs text-slate-500">{item.mobile_number || 'no mobile'}</span>
                      {!stillPosted(item) ? (
                        <span className="flex items-center gap-1 text-xs text-amber-800">
                          <TriangleAlert aria-hidden="true" className="size-3.5" /> Now posted in another zone, so not printed.
                        </span>
                      ) : !postedHere(item) && (
                        <span className="block text-xs text-slate-500">Posted in {item.posted_sector}{item.posted_sector_name && item.posted_sector_name !== item.posted_sector ? ` · ${item.posted_sector_name}` : ''}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            ) : !seniors[keyOf(slot)] ? (
              <p className="flex items-start gap-1.5 text-sm text-amber-800">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>Passports print <span className="font-semibold">Not Assigned</span>: no officer of SI rank or above is posted here. Allot officers, from anywhere in the zone if needed.</span>
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                {slot.subSector
                  ? 'Not allotted. Passports use the first officer of each of the top 3 ranks (SI and above) posted here.'
                  : 'Not allotted. Passports use the senior-most officer (SI and above) as Sector Incharge and the first officer of each of the next 3 ranks.'}
              </p>
            )}
          </div>
          <span className="flex shrink-0 gap-1.5">
            <PillButton type="button" size="sm" variant={current.length ? 'outline' : 'crimson'} icon={<UserPlus aria-hidden="true" className="size-3.5" />}
              onClick={() => setPicking(isPicking ? null : slot)}>
              {current.length ? 'Change' : 'Allot'}
            </PillButton>
            {current.length > 0 && (
              <PillButton type="button" size="sm" variant="ghost" onClick={() => save(slot, [], label)}>Remove</PillButton>
            )}
          </span>
        </div>
        {isPicking && (
          <OfficerPicker slot={slot} initial={current.map(item => item.pass_id)}
            onCancel={() => setPicking(null)}
            onSave={passIds => save(slot, passIds, label)} />
        )}
        {localLine(slot)}
      </li>
    );
  };

  return (
    <section aria-label="Sub-sector incharges" className="operations-enter space-y-3">
      <div className="operations-panel flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <div className="mr-auto min-w-0 flex-[1_1_20rem]">
          <h2 className="text-base font-semibold text-police-navy">Sector and Sub-sector Incharges</h2>
          <p className="text-xs text-slate-500">
            Allot up to 3 officers for each sub-sector, or for a sector that has no sub-sectors: the 1st prints as the Incharge and the
            next two below it, with phone numbers. A sector with sub-sectors always uses its senior-most officer (SI and above) as Sector Incharge.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-semibold text-sky-800">Local Officer:</span> a contact from anywhere in the personnel directory, printed below the incharges.
            Add one or more to a sector (all its sub-sectors use them) or give a sub-sector its own. One officer can be added to many places.
          </p>
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Refresh allotments"
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {confirmAuto ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-600">Fill empty sectors and sub-sectors only; existing choices are kept.</span>
            <PillButton type="button" size="sm" variant="crimson" disabled={autoBusy} onClick={autoAllot}>{autoBusy ? 'Allotting…' : 'Confirm auto allot'}</PillButton>
            <PillButton type="button" size="sm" variant="ghost" disabled={autoBusy} onClick={() => setConfirmAuto(false)}>Cancel</PillButton>
          </span>
        ) : (
          <PillButton type="button" size="sm" variant="outline" icon={<Wand2 aria-hidden="true" className="size-3.5" />} onClick={() => setConfirmAuto(true)}>
            Auto allot empty
          </PillButton>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

      {zones.map((zone: Zone) => {
        const slots: Slot[] = zone.sectors.flatMap((sector): Slot[] => sector.subSectors?.length
          ? sector.subSectors.map(subSector => ({ zone: zone.name, sector: sector.number, subSector }))
          : [{ zone: zone.name, sector: sector.number, subSector: null }]);
        const isOpen = open.has(zone.name);
        const done = slots.filter(slot => bySlot.has(keyOf(slot))).length;
        const blank = slots.filter(slot => !bySlot.has(keyOf(slot)) && !seniors[keyOf(slot)]).length;
        return (
          <article key={zone.name} className="operations-panel p-3 sm:p-4">
            <button type="button" aria-expanded={isOpen}
              onClick={() => setOpen(previous => { const next = new Set(previous); if (next.has(zone.name)) next.delete(zone.name); else next.add(zone.name); return next; })}
              className="flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">Zone {zone.number}: {zone.name}</span>
                <span className="block text-xs text-slate-500">
                  {done} of {slots.length} allotted · {zone.sectors.length} {zone.sectors.length === 1 ? 'sector' : 'sectors'}
                  {blank > 0 && <span className="ml-1 font-semibold text-amber-800">· {blank} would print Not Assigned</span>}
                </span>
              </span>
              <ChevronDown aria-hidden="true" className={`size-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <ul className="mt-3 space-y-2">
                {zone.sectors.map(sector => sector.subSectors?.length ? (
                  <React.Fragment key={sector.number}>
                    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sector.number}</p>
                      <p className="text-sm font-medium leading-snug text-slate-800">{sector.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Sector Incharge: senior-most officer (SI and above) posted in this sector, chosen automatically.</p>
                      {localLine({ zone: zone.name, sector: sector.number, subSector: null })}
                    </li>
                    {sector.subSectors.map(subSector => row({ zone: zone.name, sector: sector.number, subSector }, sector.name))}
                  </React.Fragment>
                ) : row({ zone: zone.name, sector: sector.number, subSector: null }, sector.name))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}

/** Pick up to 3 officers posted in the sub-sector, in order; "Auto select" takes the first officer of each of the top 3 ranks. */
function OfficerPicker({ slot, initial, onSave, onCancel }: {
  slot: Slot; initial: string[];
  onSave: (passIds: string[]) => void; onCancel: () => void;
}) {
  const [officers, setOfficers] = useState<DeploymentOfficer[] | null>(null);
  const [wholeZone, setWholeZone] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setOfficers(null);
    const params = new URLSearchParams({ zone: slot.zone, ...(wholeZone ? {} : { sector: slot.sector }) });
    fetch(`/api/deployment/officers?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the officers.');
        const all = data.officers as DeploymentOfficer[];
        setOfficers(slot.subSector && !wholeZone ? all.filter(officer => officer.police_sector_name === slot.subSector) : all);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [slot.zone, slot.sector, slot.subSector, wholeZone]);

  const [known, setKnown] = useState<Map<string, DeploymentOfficer>>(new Map());
  useEffect(() => { if (officers) setKnown(previous => new Map([...previous, ...officers.map(officer => [officer.id, officer] as const)])); }, [officers]);
  const byId = known;
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (officers ?? [])
      .filter(officer => !term || officer.full_name.toLowerCase().includes(term) || (officer.police_id_number ?? '').toLowerCase().includes(term)
        || displayRank(officer.rank).toLowerCase().includes(term) || (officer.mobile_number ?? '').includes(term))
      .sort((a, b) => rankSeniority(a.rank) - rankSeniority(b.rank) || a.full_name.localeCompare(b.full_name));
  }, [officers, search]);
  const autoPick = useMemo(() => topRankOfficers((officers ?? []).map(officer => ({
    id: officer.id, zone: slot.zone, sector: slot.sector, sector_name: officer.police_sector_name,
    full_name: officer.full_name, rank: officer.rank, mobile_number: officer.mobile_number,
  }))).slice(0, SUB_SECTOR_OFFICERS).map(officer => officer.id), [officers, slot.zone, slot.sector]);
  const seniorCount = (officers ?? []).filter(officer => isSeniorRank(officer.rank)).length;

  // Print order follows rank, most senior first (the senior-most is the Incharge), whatever order they were ticked in;
  // officers of the same rank keep the order they were ticked.
  const bySeniority = (ids: string[]) => ids
    .map((id, index) => ({ id, index, seniority: rankSeniority(byId.get(id)?.rank) }))
    .sort((a, b) => a.seniority - b.seniority || a.index - b.index)
    .map(item => item.id);
  const toggle = (id: string) => setChosen(previous => bySeniority(previous.includes(id)
    ? previous.filter(item => item !== id)
    : previous.length < SUB_SECTOR_OFFICERS ? [...previous, id] : previous));

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-0 flex-[1_1_14rem]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={search} onChange={event => setSearch(event.target.value)} aria-label={`Search officers in this ${slot.subSector ? 'sub-sector' : 'sector'}`}
            placeholder="Search name, rank, G.No. or mobile"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20" />
        </span>
        <PillButton type="button" size="sm" variant="outline" disabled={!autoPick.length} icon={<Wand2 aria-hidden="true" className="size-3.5" />}
          onClick={() => setChosen(autoPick)}>
          Auto select top 3
        </PillButton>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={wholeZone} onChange={event => setWholeZone(event.target.checked)} className="size-4 rounded border-slate-300" />
          Whole zone
        </label>
        <button type="button" onClick={onCancel} aria-label="Close officer list" className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
          <X className="size-4" />
        </button>
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-xs font-semibold text-slate-600">Chosen ({chosen.length} of {SUB_SECTOR_OFFICERS}), in print order: senior-most rank first</p>
        {chosen.length ? (
          <ol className="mt-1 space-y-0.5 text-sm">
            {bySeniority(chosen).map((id, index) => {
              const officer = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-xs font-semibold text-police-navy">{ordinal(slot, index)}</span>
                  <span className="min-w-0 flex-1 truncate">{officer ? `${displayRank(officer.rank)} ${officer.full_name}` : 'Officer no longer posted here'}</span>
                  <button type="button" onClick={() => toggle(id)} aria-label="Remove from the chosen list" className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-slate-200"><X className="size-3.5" /></button>
                </li>
              );
            })}
          </ol>
        ) : <p className="mt-1 text-xs text-slate-500">Tick up to 3 officers below, or use Auto select top 3.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {officers === null && !error && <p className="p-2 text-sm text-slate-500">Loading officers…</p>}
      {officers && !matches.length && <p className="p-2 text-sm text-slate-500">{officers.length ? 'No officer matches.' : `No officers are posted in this ${slot.subSector ? 'sub-sector' : 'sector'} yet.`}</p>}
      {officers && officers.length > 0 && !seniorCount && <p className="text-xs text-amber-800">No officer of SI rank or above is posted here, so Auto select has nobody to pick.</p>}
      {matches.length > 0 && (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {matches.slice(0, MAX_SHOWN).map(officer => {
            const position = chosen.indexOf(officer.id);
            const full = position < 0 && chosen.length >= SUB_SECTOR_OFFICERS;
            return (
              <li key={officer.id}>
                <button type="button" disabled={full} onClick={() => toggle(officer.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left disabled:opacity-40 ${position >= 0 ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                  <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded border ${position >= 0 ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                    {position >= 0 ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className="w-16 shrink-0 text-xs font-semibold text-police-navy">{displayRank(officer.rank)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{officer.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      G.No. {officer.police_id_number || '-'} · {officer.mobile_number || 'no mobile'}
                      {wholeZone && officer.police_sector_number ? ` · ${officer.police_sector_number}${officer.police_sector_name && officer.police_sector_name !== officer.police_sector_number ? ` ${officer.police_sector_name.split(' ')[0]}` : ''}` : ''}
                    </span>
                  </span>
                  {position >= 0 && <span className="shrink-0 text-xs font-semibold text-emerald-700">{position + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > MAX_SHOWN && <p className="text-xs text-slate-500">Showing the {MAX_SHOWN} most senior of {matches.length}. Search to narrow the list.</p>}

      <div className="flex justify-end gap-2">
        <PillButton type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</PillButton>
        <PillButton type="button" size="sm" variant="crimson" disabled={busy || !chosen.length} onClick={() => { setBusy(true); onSave(bySeniority(chosen)); }}>
          Save {chosen.length ? `(${chosen.length})` : ''}
        </PillButton>
      </div>
    </div>
  );
}
