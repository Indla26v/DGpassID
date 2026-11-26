'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Shuffle, Send, UserPlus } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { AP_DISTRICTS, POLICE_SPECIAL_UNITS } from '@/core/domain/districts';
import { ASI_HC_GROUP, displayRank, FORCE_CATEGORIES, FORCE_LABELS, rankGroupOf, RANK_GROUPS } from '@/core/domain/ranks';
import { ageBand, asiHcTargets, compositionOf } from '@/modules/deployment/selection';
import type { DeploymentOfficer } from '@/modules/deployment/deployment.repository';
import { AllotDialog } from './AllotDialog';

type PoolOfficer = DeploymentOfficer & { age: number | null };

interface AutoSelection {
  requested: number;
  shortfall: number;
  notes: string[];
}

const PAGE_SIZE = 100;

export function OfficerSelectionPanel({ knownDistricts, onAllotted }: { knownDistricts: string[]; onAllotted: () => void }) {
  // Filters — the officer list below updates live as these change.
  // '' = All ranks (default on opening).
  const [rankGroup, setRankGroup] = useState('');
  const [districts, setDistricts] = useState<string[]>([]);
  const [force, setForce] = useState('');
  const [includeAllotted, setIncludeAllotted] = useState(false);
  const [count, setCount] = useState('200');
  const [ageCutoff, setAgeCutoff] = useState<number | null>(null);

  // Live pool of matching officers and the SP's ticks.
  const [pool, setPool] = useState<PoolOfficer[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoSelection, setAutoSelection] = useState<AutoSelection | null>(null);
  const [officerQuery, setOfficerQuery] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'selected'>('all');
  const [page, setPage] = useState(0);

  // Allotment popup: which officers, and the last zone/sector used (pre-filled next time).
  const [allotIds, setAllotIds] = useState<string[] | null>(null);
  const [lastTarget, setLastTarget] = useState({ zoneName: '', sectorNumber: '', subSector: '' });
  const [allotError, setAllotError] = useState('');
  const [busy, setBusy] = useState<'select' | 'allot' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/deployment/settings', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setAgeCutoff(data.ageCutoffYears); })
      .catch(() => undefined);
  }, []);

  const districtOptions = useMemo(() => {
    const all = new Map<string, string>();
    for (const name of [...knownDistricts, ...AP_DISTRICTS, ...POLICE_SPECIAL_UNITS]) all.set(name.toLowerCase(), name);
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  }, [knownDistricts]);

  // Live display: reload matching officers whenever rank, districts or the "already allotted" option change.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPoolLoading(true);
      setError('');
      try {
        const response = await fetch('/api/deployment/selection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rankGroup, districts, force, includeAllotted, poolOnly: true }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load officers.');
        const officers: PoolOfficer[] = data.pool;
        setPool(officers);
        setAgeCutoff(current => current ?? data.ageCutoffYears);
        const ids = new Set(officers.map(officer => officer.id));
        setSelected(current => new Set([...current].filter(id => ids.has(id))));
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load officers.');
      } finally {
        if (!controller.signal.aborted) setPoolLoading(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [rankGroup, districts, force, includeAllotted, reloadKey]);

  // A new rank or district set starts a fresh selection.
  useEffect(() => {
    setAutoSelection(null);
    setSelected(new Set());
    setShowOnly('all');
    setPage(0);
  }, [rankGroup, districts, force]);

  const requested = Number(count);
  const isAsiHc = rankGroup === ASI_HC_GROUP;
  const cutoff = ageCutoff ?? 45;

  const selectedOfficers = useMemo(() => pool.filter(officer => selected.has(officer.id)), [pool, selected]);
  // Old / young split of the officers ticked right now (any rank).
  const ageSplit = useMemo(() => {
    const split = { OLD: 0, YOUNG: 0, UNKNOWN: 0 };
    for (const officer of selectedOfficers) split[ageBand(officer.age, ageCutoff ?? 45) ?? 'UNKNOWN'] += 1;
    return split;
  }, [selectedOfficers, ageCutoff]);
  const composition = useMemo(() => compositionOf(
    selectedOfficers.map(officer => ({ id: officer.id, rank: (officer.rank ?? '').toUpperCase(), age: officer.age })), cutoff,
  ), [selectedOfficers, cutoff]);
  const targets = useMemo(
    () => (isAsiHc && Number.isInteger(requested) && requested > 0 ? asiHcTargets(requested) : []),
    [isAsiHc, requested],
  );

  const visibleOfficers = useMemo(() => {
    const query = officerQuery.trim().toLowerCase();
    return pool
      .filter(officer => showOnly === 'all' || selected.has(officer.id))
      .filter(officer => !query || [officer.full_name, officer.police_id_number, officer.district, officer.mobile_number, officer.rank]
        .some(value => (value ?? '').toLowerCase().includes(query)));
  }, [pool, selected, showOnly, officerQuery]);
  const pageCount = Math.max(1, Math.ceil(visibleOfficers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageOfficers = visibleOfficers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const allPageSelected = pageOfficers.length > 0 && pageOfficers.every(officer => selected.has(officer.id));

  const setTicked = (ids: string[], checked: boolean) => setSelected(current => {
    const next = new Set(current);
    for (const id of ids) {
      if (checked) next.add(id); else next.delete(id);
    }
    return next;
  });

  const runAutoSelect = async () => {
    setBusy('select');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rankGroup, districts, force, count: requested, includeAllotted }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not select officers.');
      setPool(data.pool);
      setSelected(new Set(data.selectedIds));
      setAutoSelection({ requested: data.requested, shortfall: data.shortfall, notes: data.notes });
      setShowOnly('selected');
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not select officers.');
    } finally {
      setBusy(null);
    }
  };

  const allot = useCallback(async (passIds: string[], zoneName: string, sectorNumber: string, subSector = '') => {
    const toZone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
    const toSector = toZone?.sectors.find(item => item.number === sectorNumber);
    if (!toZone || !toSector || !passIds.length) return;
    setBusy('allot');
    setAllotError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/allot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passIds, zone: toZone.name, sectorNumber: toSector.number, subSector: subSector || null, rankGroup, districts,
          requestedCount: passIds.length > 1 && autoSelection ? autoSelection.requested : passIds.length,
          composition: passIds.length > 1 ? composition : {},
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not allot the officers.');
      const name = passIds.length === 1 ? pool.find(officer => officer.id === passIds[0])?.full_name : '';
      setNotice(`${name || `${data.allotted} officers`} allotted to Zone ${toZone.number} · ${toSector.number}: ${toSector.name}${subSector ? ` · ${subSector}` : ''}.`);
      setLastTarget({ zoneName, sectorNumber, subSector });
      setAllotIds(null);
      setTicked(passIds, false);
      if (passIds.length > 1) setAutoSelection(null);
      setReloadKey(key => key + 1);
      onAllotted();
    } catch (err) {
      setAllotError(err instanceof Error ? err.message : 'Could not allot the officers.');
    } finally {
      setBusy(null);
    }
  }, [rankGroup, districts, force, autoSelection, composition, pool, onAllotted]);

  // Rank shown in the allot popup: the chosen rank, or the officers' common rank when 'All ranks' is selected.
  const allotRankGroup = (officers: PoolOfficer[]) => {
    if (rankGroup) return rankGroup;
    const groups = new Set(officers.map(officer => rankGroupOf(officer.rank)));
    return groups.size === 1 ? [...groups][0] : '';
  };

  const openAllot = (ids: string[]) => { setAllotError(''); setAllotIds(ids); };

  const showComposition = isAsiHc && targets.length > 0 && (selected.size > 0 || autoSelection !== null);
  const fieldLabel = 'block text-xs font-semibold text-slate-700';

  return (
    <section aria-label="Officer selection" className="operations-panel operations-enter space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-police-navy">Officer selection and allotment</h2>
        <p className="text-sm text-slate-600" aria-live="polite">
          <span className="font-semibold text-police-navy">
            {poolLoading ? 'Loading…' : `${pool.length.toLocaleString()} ${rankGroup ? `${rankGroup} ` : ''}officer${pool.length === 1 ? '' : 's'}`}
          </span>
          {force ? ` · ${FORCE_LABELS[force as keyof typeof FORCE_LABELS]}` : ''}
          {' '}{districts.length ? `in ${districts.length <= 2 ? districts.join(', ') : `${districts.length} districts`}` : 'in all districts'}
          {includeAllotted ? '' : ', not yet allotted'}
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={fieldLabel}>Rank</span>
          <CustomSelect ariaLabel="Rank" value={rankGroup} searchable onChange={setRankGroup}
            options={[{ value: '', label: 'All ranks' }, ...RANK_GROUPS.map(item => ({ value: item.group, label: item.component === 'AR' ? `${item.group} (AR component)` : item.group }))]} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={fieldLabel}>Force</span>
          <CustomSelect ariaLabel="Force" value={force} onChange={setForce}
            options={[{ value: '', label: 'All forces' }, ...FORCE_CATEGORIES.map(item => ({ value: item, label: FORCE_LABELS[item] }))]} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className={fieldLabel}>Districts / units</span>
          <MultiSelectDropdown ariaLabel="Districts / units" options={districtOptions} value={districts} onChange={setDistricts}
            emptyLabel="All districts / units" />
        </div>
      </div>

      {/* Toolbar: find, auto-select, allot */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-2">
        <label className="relative block min-w-[12rem] flex-1">
          <span className="sr-only">Search officers</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input type="search" value={officerQuery} onChange={event => { setOfficerQuery(event.target.value); setPage(0); }}
            placeholder="Search name, ID, district or mobile" className="operations-input bg-white pl-9 pr-3" />
        </label>
        <div role="group" aria-label="Officers shown" className="flex gap-1">
          <PillButton type="button" size="sm" variant={showOnly === 'all' ? 'secondary' : 'outline'} aria-pressed={showOnly === 'all'}
            onClick={() => { setShowOnly('all'); setPage(0); }}>All</PillButton>
          <PillButton type="button" size="sm" variant={showOnly === 'selected' ? 'secondary' : 'outline'} aria-pressed={showOnly === 'selected'}
            disabled={!selected.size} onClick={() => { setShowOnly('selected'); setPage(0); }}>
            Ticked{selected.size ? ` (${selected.size}${autoSelection ? `/${autoSelection.requested}` : ''})` : ''}
          </PillButton>
        </div>
        <label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-xs text-slate-700">
          <input type="checkbox" checked={includeAllotted} onChange={event => setIncludeAllotted(event.target.checked)} className="size-4 accent-police-crimson" />
          Include allotted
        </label>
        <span aria-hidden="true" className="hidden h-6 w-px bg-slate-300 sm:block" />
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="auto-select-count">How many officers to auto-select</label>
          <input id="auto-select-count" type="number" min={1} max={5000} value={count} onChange={event => setCount(event.target.value)}
            title="How many officers to auto-select" className="operations-input w-20 bg-white px-2.5 text-center tabular-nums" />
          <PillButton type="button" size="sm" variant="outline" disabled={busy !== null || !Number.isInteger(requested) || requested < 1 || !pool.length}
            title={isAsiHc ? 'Random pick: ASI 20% · WASI 5% · HC 70% · WHC 5%, 40% old / 60% young' : 'Random pick'}
            icon={<Shuffle aria-hidden="true" className="size-3.5" />} onClick={runAutoSelect}>
            {busy === 'select' ? 'Selecting…' : 'Auto-select'}
          </PillButton>
        </div>
        <PillButton type="button" size="sm" variant="crimson" className="sm:ml-auto" disabled={busy !== null || !selected.size}
          title={selected.size ? 'Choose a zone and sector for the ticked officers' : 'Tick officers first'}
          icon={<Send aria-hidden="true" className="size-3.5" />} onClick={() => openAllot([...selected])}>
          Allot {selected.size || ''} ticked
        </PillButton>
      </div>

      {/* Old / young split of the ticked officers */}
      {selected.size > 0 && (() => {
        const total = selected.size;
        const pct = (n: number) => Math.round((n / total) * 100);
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 px-3.5 py-2.5" aria-label="Old and young among ticked officers">
            <span className="text-xs font-semibold text-slate-700">Ticked {total}</span>
            <span aria-hidden="true" className="flex h-2.5 min-w-40 flex-1 overflow-hidden rounded-full bg-slate-200">
              <span className="h-full bg-police-navy" style={{ width: `${pct(ageSplit.OLD)}%` }} />
              <span className="h-full bg-teal-500" style={{ width: `${pct(ageSplit.YOUNG)}%` }} />
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-police-navy px-2.5 py-1 font-semibold text-white">
                Old (≥{ageCutoff ?? 45}) {ageSplit.OLD} · {pct(ageSplit.OLD)}%
              </span>
              <span className="rounded-full bg-teal-600 px-2.5 py-1 font-semibold text-white">
                Young {ageSplit.YOUNG} · {pct(ageSplit.YOUNG)}%
              </span>
              {ageSplit.UNKNOWN > 0 && (
                <span className="rounded-full bg-slate-200 px-2.5 py-1 font-semibold text-slate-800">Age unknown {ageSplit.UNKNOWN}</span>
              )}
              {isAsiHc && <span className="text-slate-500">Target 40% old · 60% young</span>}
            </span>
          </div>
        );
      })()}

      {/* ASI/HC composition: target vs ticked, only while a selection is being built */}
      {showComposition && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="ASI/HC composition, ticked of target">
          {['ASI', 'WASI', 'HC', 'WHC'].map(rank => {
            const goal = (band: string) => targets.find(item => item.rank === rank && item.band === band)?.target ?? 0;
            const row = composition[rank] ?? { OLD: 0, YOUNG: 0, UNKNOWN: 0 };
            const met = row.OLD >= goal('OLD') && row.YOUNG >= goal('YOUNG');
            return (
              <span key={rank} className={`rounded-full border px-2.5 py-1 tabular-nums ${met ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                <span className="font-semibold">{rank}</span> old {row.OLD}/{goal('OLD')} · young {row.YOUNG}/{goal('YOUNG')}
                {row.UNKNOWN > 0 && <span className="text-rose-700"> · age? {row.UNKNOWN}</span>}
              </span>
            );
          })}
        </div>
      )}
      {autoSelection && autoSelection.notes.length > 0 && (
        <p className="text-xs text-rose-800">{autoSelection.notes.join(' · ')}</p>
      )}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

      <div role="region" aria-label="Officers" tabIndex={0} className="max-h-[34rem] overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-slate-600">
              <th scope="col" className="w-8 px-2 py-2">
                <input type="checkbox" aria-label="Tick all officers on this page" checked={allPageSelected} disabled={!pageOfficers.length}
                  className="size-4 accent-police-crimson"
                  onChange={event => setTicked(pageOfficers.map(officer => officer.id), event.target.checked)} />
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">Officer</th>
              <th scope="col" className="px-2 py-2 font-semibold">Rank</th>
              <th scope="col" className="px-2 py-2 font-semibold">Age</th>
              <th scope="col" className="px-2 py-2 font-semibold">District / unit</th>
              <th scope="col" className="px-2 py-2 font-semibold">Current posting</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold"><span className="sr-only">Allot</span></th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${poolLoading ? 'opacity-60' : ''}`}>
            {pageOfficers.map(officer => {
              const band = ageBand(officer.age, cutoff);
              return (
                <tr key={officer.id} className={selected.has(officer.id) ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                  <td className="px-2 py-1">
                    <input type="checkbox" aria-label={`Tick ${officer.full_name}`} checked={selected.has(officer.id)}
                      className="size-4 accent-police-crimson"
                      onChange={event => setTicked([officer.id], event.target.checked)} />
                  </td>
                  <th scope="row" className="px-2 py-1 font-normal">
                    <span className="block font-semibold text-slate-900">{officer.full_name}</span>
                    <span className="text-slate-500">{[officer.police_id_number, officer.mobile_number, officer.police_station].filter(Boolean).join(' · ')}</span>
                    {officer.force_category && officer.force_category !== 'CIVIL' && (
                      <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600">{FORCE_LABELS[officer.force_category as keyof typeof FORCE_LABELS] ?? officer.force_category}</span>
                    )}
                  </th>
                  <td className="whitespace-nowrap px-2 py-1">
                    <span className="font-semibold text-police-crimson">{displayRank(officer.rank)}</span>
                    {isAsiHc && <span className="ml-1 text-slate-500">({officer.rank})</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                    {officer.age ?? '—'}{band && <span className="ml-1 text-slate-500">{band === 'OLD' ? 'old' : 'young'}</span>}
                  </td>
                  <td className="px-2 py-1">{officer.district}</td>
                  <td className="px-2 py-1 text-slate-600">
                    {officer.police_zone
                      ? <>{officer.police_zone}{officer.police_sector_number ? ` · ${officer.police_sector_number}` : ''}</>
                      : <span className="text-rose-700">Not allotted</span>}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <PillButton type="button" size="sm" variant="outline" className="!min-h-7 !px-2.5 !py-1" disabled={busy !== null}
                      title={`Allot ${officer.full_name} to a zone and sector`} aria-label={`Allot ${officer.full_name}`}
                      icon={<UserPlus aria-hidden="true" className="size-3.5" />} onClick={() => openAllot([officer.id])}>
                      Allot
                    </PillButton>
                  </td>
                </tr>
              );
            })}
            {!pageOfficers.length && (
              <tr><td colSpan={7} className="p-5 text-center text-slate-500">
                {poolLoading ? 'Loading officers…' : showOnly === 'selected' ? 'No officers ticked.' : 'No officers match this rank and district.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{selected.size ? `${selected.size} ticked` : 'Tick officers or use Allot on a row.'}</span>
        {pageCount > 1 && (
          <span className="flex items-center gap-1.5">
            <PillButton type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</PillButton>
            <span className="px-1 font-semibold">Page {currentPage + 1} of {pageCount}</span>
            <PillButton type="button" size="sm" variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</PillButton>
          </span>
        )}
      </div>
      {allotIds && (
        <AllotDialog
          officers={pool.filter(officer => allotIds.includes(officer.id))}
          rankGroup={allotRankGroup(pool.filter(officer => allotIds.includes(officer.id)))}
          initialZone={lastTarget.zoneName}
          initialSector={lastTarget.sectorNumber}
          initialSubSector={lastTarget.subSector}
          busy={busy === 'allot'}
          error={allotError}
          onConfirm={(zoneName, sectorNumber, subSector) => allot(allotIds, zoneName, sectorNumber, subSector)}
          onClose={() => setAllotIds(null)}
        />
      )}
    </section>
  );
}
