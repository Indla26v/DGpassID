'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Search, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { POLICE_BANDOBUSHT_ZONES, resolveDutyPosting } from '@/core/domain/police-zones';
import { MAX_PASSPORTS, passportPeriodLine } from '@/core/domain/duty-passport';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';

type Count = { zone: string; sector: string; sectorName: string | null; count: number };
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20';
const label = 'block text-xs font-semibold text-slate-700';

const zoneLabel = (name: string) => {
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === name);
  return zone ? `Zone ${zone.number}: ${zone.name}` : name;
};
const sectorLabel = (zoneName: string, number: string) => {
  const sector = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName)?.sectors.find(item => item.number === number);
  return sector ? `${sector.number}: ${sector.name}` : number;
};

/** Choose which allotted officers to print duty passports for (one A4 page each), then download or open the PDF. */
export function PassportPrintDialog({ instruction, onClose }: { instruction: DutyInstruction; onClose: () => void }) {
  const [all, setAll] = useState<Count[] | null>(null);
  const [zone, setZone] = useState('');
  const [sector, setSector] = useState('');
  const [subSector, setSubSector] = useState('');
  const [search, setSearch] = useState('');
  const [matching, setMatching] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const base = `/api/deployment/instructions/${instruction.id}/passports`;

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (zone) params.set('zone', zone);
    if (sector) params.set('sector', sector);
    if (subSector) params.set('subSector', subSector);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  }, [zone, sector, subSector, search]);

  // All counts once (for the filter options), then the matching count for the chosen filters.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${base}?summary=1${query ? `&${query}` : ''}`, { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not count the officers.');
          const counts = data.counts as Count[];
          if (!query) setAll(counts);
          setMatching(counts.reduce((sum, item) => sum + item.count, 0));
        })
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    }, search ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, query, search]);

  const zones = [...new Set((all ?? []).map(item => item.zone))]
    .sort((a, b) => POLICE_BANDOBUSHT_ZONES.findIndex(z => z.name === a) - POLICE_BANDOBUSHT_ZONES.findIndex(z => z.name === b));
  const activeZone = zone || (zones.length === 1 ? zones[0] : '');
  const sectors = activeZone ? [...new Set((all ?? []).filter(item => item.zone === activeZone).map(item => item.sector))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const subSectors = activeZone && sector ? [...new Set((all ?? [])
    .filter(item => item.zone === activeZone && item.sector === sector)
    .map(item => resolveDutyPosting(item.zone, item.sector, item.sectorName).subSector)
    .filter((value): value is string => Boolean(value)))] : [];

  const tooMany = matching !== null && matching > MAX_PASSPORTS;
  const url = `${base}${query ? `?${query}` : ''}`;

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${url}${query ? '&' : '?'}download=1`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not prepare the duty passports.');
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'duty-passports.pdf';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the duty passports.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="passport-dialog-title" tabIndex={-1}
        onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 bg-police-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Duty passports · one A4 page per officer</p>
            <h3 id="passport-dialog-title" className="truncate text-lg font-semibold">{instruction.title}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {passportPeriodLine(instruction) || 'No duty dates set on this instruction.'}
            {(instruction.back_points ?? []).some(point => point.trim()) && (
              <span className="mt-1 block font-semibold text-police-navy">Each passport has a back side (Brief Instructions): print double-sided, flip on long edge.</span>
            )}
          </p>

          {zones.length > 1 && (
            <label className="block space-y-1">
              <span className={label}>Zone</span>
              <select value={zone} onChange={event => { setZone(event.target.value); setSector(''); setSubSector(''); }} className={field}>
                <option value="">All zones</option>
                {zones.map(name => <option key={name} value={name}>{zoneLabel(name)}</option>)}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={label}>Sector</span>
              <select value={sector} disabled={!activeZone} onChange={event => { setSector(event.target.value); setSubSector(''); if (!zone && activeZone) setZone(activeZone); }} className={field}>
                <option value="">{activeZone ? 'All sectors' : 'Choose a zone first'}</option>
                {sectors.map(number => <option key={number} value={number}>{sectorLabel(activeZone, number)}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Sub-sector</span>
              <select value={subSector} disabled={!subSectors.length} onChange={event => setSubSector(event.target.value)} className={field}>
                <option value="">{subSectors.length ? 'Whole sector' : 'None'}</option>
                {subSectors.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className={label}>Officer <span className="font-normal text-slate-500">(optional: name or G.No. for a single reprint)</span></span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} maxLength={80} placeholder="Search" className={`${field} pl-9`} />
            </span>
          </label>

          <p role="status" className={`text-sm ${tooMany ? 'text-rose-800' : 'text-slate-700'}`}>
            {matching === null ? 'Counting officers…'
              : matching === 0 ? 'No allotted officers match.'
                : tooMany ? `${matching} officers match. Narrow it to a sector (at most ${MAX_PASSPORTS} per PDF).`
                  : `${matching} passport${matching === 1 ? '' : 's'} will be printed.`}
          </p>
          {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <a href={matching && !tooMany ? url : undefined} target="_blank" rel="noopener" aria-disabled={!matching || tooMany}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${!matching || tooMany ? 'pointer-events-none opacity-50' : ''}`}>
            <ExternalLink aria-hidden="true" className="size-4" /> Open to print
          </a>
          <PillButton type="button" variant="crimson" onClick={download} disabled={busy || !matching || tooMany}
            icon={<Download aria-hidden="true" className="size-4" />}>
            {busy ? 'Preparing…' : 'Download PDF'}
          </PillButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
