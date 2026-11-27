'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, X } from 'lucide-react';
import { useDialog } from '../common/useDialog';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { displayRank } from '@/core/domain/ranks';
import { requirementTotal, SCHEME_RANK_COLUMNS, schemeColumnOf, type RankRequirement } from '@/core/domain/scheme-requirements';

interface SectorSummary {
  required: RankRequirement | null;
  allotted: Record<string, number>;
  other: Record<string, number>;
  total: number;
  subSectors?: { name: string; required: RankRequirement | null; allotted: Record<string, number> }[];
}

export interface AllotDialogOfficer {
  id: string;
  full_name: string;
  rank: string | null;
  district: string;
  police_zone: string | null;
  police_sector_number: string | null;
}

/** Popup for allotting one or more officers to a zone and sector. */
export function AllotDialog({
  officers, rankGroup, initialZone, initialSector, initialSubSector = '', busy, error, onConfirm, onClose,
}: {
  officers: AllotDialogOfficer[];
  rankGroup: string;
  initialZone: string;
  initialSector: string;
  initialSubSector?: string;
  busy: boolean;
  error: string;
  onConfirm: (zoneName: string, sectorNumber: string, subSector: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialog(true, () => { if (!busy) onClose(); });
  const [zoneName, setZoneName] = useState(initialZone);
  const [sectorNumber, setSectorNumber] = useState(initialSector);
  const [subSector, setSubSector] = useState(initialSubSector);
  const [summary, setSummary] = useState<SectorSummary | null>(null);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
  const sector = zone?.sectors.find(item => item.number === sectorNumber);
  const single = officers.length === 1;
  const subSectors = sector?.subSectors ?? [];
  const chosenSub = subSectors.includes(subSector) ? subSector : '';

  // Scheme requirement vs officers already allotted to the chosen sector, by rank.
  useEffect(() => {
    setSummary(null);
    if (!zone || !sector) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ zone: zone.name, sector: sector.number });
    fetch(`/api/deployment/sector-summary?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setSummary(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [zone, sector]);

  const column = schemeColumnOf(rankGroup);
  const adding = officers.filter(officer => officer.police_zone !== zoneName || officer.police_sector_number !== sectorNumber).length;
  const needed = column && summary?.required ? summary.required[column] ?? 0 : null;
  const have = column ? summary?.allotted[column] ?? 0 : 0;
  const after = have + adding;
  // Strength of the chosen sub-sector, when the scheme gives one.
  const subSummary = chosenSub ? summary?.subSectors?.find(item => item.name === chosenSub) : undefined;
  const subAllotted = subSummary ? Object.values(subSummary.allotted).reduce((sum, n) => sum + n, 0) : 0;
  const subRequired = subSummary?.required ? requirementTotal(subSummary.required) : null;
  const subNeeded = column && subSummary?.required ? subSummary.required[column] ?? 0 : null;
  const subHave = column && subSummary ? subSummary.allotted[column] ?? 0 : 0;

  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="allot-dialog-title" tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 bg-police-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Allot to zone and sector</p>
            <h3 id="allot-dialog-title" className="truncate text-lg font-semibold">
              {single ? officers[0].full_name : `${officers.length} ${rankGroup ? `${rankGroup} ` : ''}officers`}
            </h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          <ul aria-label="Officers being allotted" className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {officers.map(officer => (
              <li key={officer.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{officer.full_name}</span>
                <span className="text-police-crimson"> · {displayRank(officer.rank)}</span>
                <span className="text-slate-500"> · {officer.district}</span>
                {officer.police_zone && <span className="text-rose-700"> · now {officer.police_zone}{officer.police_sector_number ? ` ${officer.police_sector_number}` : ''}</span>}
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Zone</span>
              <CustomSelect ariaLabel="Zone" wrapValue value={zoneName} placeholder="Choose zone"
                onChange={value => { setZoneName(value); setSectorNumber(''); setSubSector(''); }}
                options={POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number}: ${item.name}` }))} />
            </div>
            <div className="min-w-0 space-y-1">
              <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Sector</span>
              <CustomSelect ariaLabel="Sector" wrapValue searchable value={sectorNumber} disabled={!zone}
                placeholder={zone ? 'Choose sector' : 'Choose a zone first'} onChange={value => { setSectorNumber(value); setSubSector(''); }}
                options={(zone?.sectors ?? []).map(item => ({ value: item.number, label: `${item.number}: ${item.name}` }))} />
            </div>
            {subSectors.length > 0 && (
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Sub-sector <span className="font-normal text-slate-500">(optional)</span></span>
                <CustomSelect ariaLabel="Sub-sector" wrapValue searchable value={chosenSub} onChange={setSubSector}
                  options={[{ value: '', label: 'Whole sector (no sub-sector yet)' }, ...subSectors.map(item => ({ value: item, label: item }))]} />
              </div>
            )}
          </div>

          {zone && sector && (
            <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3 text-xs">
              {!summary ? (
                <p className="text-slate-500">Loading the sector’s strength…</p>
              ) : (
                <>
                  {chosenSub && (
                    <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
                      <span className="font-semibold">{chosenSub}</span>
                      {': '}{subAllotted}{subRequired ? ` of ${subRequired}` : ''} allotted
                      {subNeeded !== null && column ? ` · ${column} ${subHave} of ${subNeeded} → ${subHave + adding}` : ''}
                    </p>
                  )}
                  {column && needed !== null && (
                    <p className={`rounded-xl px-3 py-2 text-sm ${after > needed ? 'bg-rose-50 text-rose-800' : after === needed ? 'bg-emerald-50 text-emerald-900' : 'bg-white text-police-navy'}`}>
                      <span className="font-semibold">{column}: {have} of {needed} needed</span>
                      {' → '}{after} after this allotment
                      {after > needed ? ` (${after - needed} more than the scheme)` : after === needed ? ' (complete)' : ` (${needed - after} still needed)`}
                    </p>
                  )}
                  {column && needed === null && (
                    <p className="text-slate-600">The scheme gives no rank-wise strength for this sector. {column} already here: {have}.</p>
                  )}
                  {!rankGroup && (
                    <p className="text-slate-600">These officers have different ranks: see each rank's allotted / required below.</p>
                  )}
                  {!column && rankGroup && (
                    <p className="text-slate-600">AR component ranks are not split by rank in the scheme abstract. {rankGroup} already here: {summary.other[rankGroup] ?? 0}.</p>
                  )}
                  {summary.required && (
                    <div>
                      <p className="mb-1 font-semibold text-slate-700">
                        Sector strength: {summary.total} of {requirementTotal(summary.required)} allotted
                      </p>
                      <ul className="flex flex-wrap gap-1.5" aria-label="Allotted of required, by rank">
                        {SCHEME_RANK_COLUMNS.filter(rank => (summary.required?.[rank] ?? 0) > 0 || (summary.allotted[rank] ?? 0) > 0).map(rank => {
                          const need = summary.required?.[rank] ?? 0;
                          const got = summary.allotted[rank] ?? 0;
                          return (
                            <li key={rank} className={`rounded-full border px-2.5 py-1 tabular-nums ${rank === column ? 'border-police-crimson bg-rose-50 font-semibold text-police-crimson'
                              : got >= need ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                              {rank} {got}/{need}
                            </li>
                          );
                        })}
                        {Object.entries(summary.other).map(([rank, got]) => (
                          <li key={rank} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 tabular-nums text-slate-600">{rank} {got}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-3">
          <PillButton type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</PillButton>
          <PillButton type="button" variant="crimson" disabled={busy || !zone || !sector}
            icon={<Send aria-hidden="true" className="size-3.5" />} onClick={() => onConfirm(zoneName, sectorNumber, chosenSub)}>
            {busy ? 'Allotting…' : zone && sector
              ? `Allot ${single ? '' : `${officers.length} `}to Zone ${zone.number} · ${sector.number}${chosenSub ? ` · ${chosenSub.match(/^\d+\(\w\)/)?.[0] ?? 'sub-sector'}` : ''}`
              : `Allot ${single ? 'officer' : `${officers.length} officers`}`}
          </PillButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
