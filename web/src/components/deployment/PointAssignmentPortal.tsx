'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPinned, Plus, Search, Undo2, UserCheck, UserMinus, X } from 'lucide-react';
import { DutyPointsMapDialog } from './DutyPointsMapDialog';
import { useCustomDutyPoints } from './useCustomDutyPoints';
import { useAuth } from '@/auth/AuthProvider';
import { OperationsHeader } from '../common/OperationsHeader';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { dutyPointsFor, POLICE_BANDOBUSHT_ZONES, type PoliceSectorItem } from '@/core/domain/police-zones';
import { limitedSubSectors } from '@/core/domain/police-print-scope';
import { displayRank, FORCE_CATEGORIES, FORCE_LABELS, rankGroupOf, RANK_GROUPS } from '@/core/domain/ranks';
import type { DeploymentOfficer } from '@/modules/deployment/deployment.repository';

/** Tree node the officer list is filtered to: a whole sector, a sub-sector, or one point. */
type Node = { sector: string; subSector?: string | null; point?: string | null };

const subSectorOf = (sector: PoliceSectorItem | undefined, officer: DeploymentOfficer) =>
  sector?.subSectors?.includes(officer.police_sector_name ?? '') ? officer.police_sector_name : null;

export function PointAssignmentPortal({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const isSp = user.role === 'ADMIN';
  const scope = useMemo(() => user.policePrintScope ?? [], [user.policePrintScope]);
  const zones = POLICE_BANDOBUSHT_ZONES.filter(zone => isSp || scope.some(item => item.zone === zone.name));
  const [zoneName, setZoneName] = useState(zones[0]?.name ?? '');
  const zone = zones.find(item => item.name === zoneName);
  const zoneWide = isSp || scope.some(item => item.zone === zoneName && item.sector === null);
  const sectors = (zone?.sectors ?? []).filter(sector => zoneWide || scope.some(item => item.zone === zoneName && item.sector === sector.number));
  const [sectorFilter, setSectorFilter] = useState('');

  const [officers, setOfficers] = useState<DeploymentOfficer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [node, setNode] = useState<Node | null>(null);
  const [placement, setPlacement] = useState<'unplaced' | 'all'>('unplaced');
  const [rankFilter, setRankFilter] = useState('');
  const [forceFilter, setForceFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<{ sector: string; subSector: string; point: string }>({ sector: '', subSector: '', point: '' });
  const [saving, setSaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmSendBack, setConfirmSendBack] = useState(false);
  // Duty points added in the app; `pointsVersion` re-reads the point lists after they load or change.
  const { version: pointsVersion, reload: reloadPoints } = useCustomDutyPoints();
  const [addingPoint, setAddingPoint] = useState(false);
  const [newPointName, setNewPointName] = useState('');
  const [pointBusy, setPointBusy] = useState(false);

  const activeSector = sectorFilter || (sectors.length === 1 ? sectors[0].number : '');
  // Sub-sectors of the chosen sector (the Sub-sector filter appears only when there are some).
  const allowedSubs = (sectorNumber: string | undefined, subs: string[]) => {
    const only = isSp || !sectorNumber ? null : limitedSubSectors(scope, zoneName, sectorNumber);
    return only ? subs.filter(sub => only.includes(sub)) : subs;
  };
  const activeSubSectors = allowedSubs(activeSector, sectors.find(item => item.number === activeSector)?.subSectors ?? []);
  const selectedSubSector = node?.sector === activeSector && node.subSector && activeSubSectors.includes(node.subSector) ? node.subSector : '';

  const load = useCallback(async () => {
    if (!zoneName) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ zone: zoneName });
      if (activeSector) params.set('sector', activeSector);
      const response = await fetch(`/api/deployment/officers?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the officers.');
      setOfficers(data.officers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the officers.');
      setOfficers([]);
    } finally {
      setLoading(false);
    }
  }, [zoneName, activeSector]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(new Set()); setNode(null); }, [zoneName, activeSector]);

  const shownSectors = sectors.filter(sector => !activeSector || sector.number === activeSector);
  const sectorByNumber = (number: string | null | undefined) => zone?.sectors.find(item => item.number === number);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const bump = (key: string) => map.set(key, (map.get(key) ?? 0) + 1);
    for (const officer of officers) {
      const sector = sectorByNumber(officer.police_sector_number);
      bump(`S|${officer.police_sector_number}`);
      const sub = subSectorOf(sector, officer);
      if (sub) bump(`U|${officer.police_sector_number}|${sub}`);
      if (officer.police_point_code) bump(`P|${officer.police_point_code}`);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officers, zone]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return officers.filter(officer => {
      if (node) {
        if (officer.police_sector_number !== node.sector) return false;
        if (node.subSector && subSectorOf(sectorByNumber(node.sector), officer) !== node.subSector) return false;
        if (node.point && officer.police_point_code !== node.point) return false;
      }
      if (placement === 'unplaced' && !node?.point && officer.police_point_code) return false;
      if (rankFilter && rankGroupOf(officer.rank) !== rankFilter) return false;
      if (forceFilter && officer.force_category !== forceFilter) return false;
      return !text || [officer.full_name, officer.police_id_number, officer.mobile_number, officer.district, officer.police_point_name]
        .some(value => (value ?? '').toLowerCase().includes(text));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officers, node, placement, rankFilter, forceFilter, query, zone]);

  const targetSector = sectorByNumber(target.sector || activeSector || node?.sector);
  const targetSubSectors = allowedSubs(targetSector?.number, targetSector?.subSectors ?? []);
  // A sub-sector login must post inside one of its sub-sectors, so "No sub-sector" is not offered.
  const subSectorRequired = Boolean(targetSector && !isSp && limitedSubSectors(scope, zoneName, targetSector.number));
  const targetPoints = targetSector
    ? dutyPointsFor(zoneName, targetSector.number, targetSubSectors.length ? (target.subSector || null) : undefined)
    : [];

  const chooseNode = (next: Node) => {
    setNode(next);
    setSelected(new Set());
    const point = next.point ? dutyPointsFor(zoneName, next.sector).find(item => item.code === next.point) : undefined;
    setTarget({ sector: next.sector, subSector: point?.subSector ?? next.subSector ?? '', point: next.point ?? '' });
  };

  const save = async (passIds: string[], destination: { sector: string; subSector: string; point: string }) => {
    if (!passIds.length || !destination.sector) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/points', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passIds, zone: zoneName, sectorNumber: destination.sector,
          subSector: destination.subSector || null, pointCode: destination.point || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the duty posting.');
      setNotice(`${data.updated} officer${data.updated === 1 ? '' : 's'} posted.` + (data.rejected ? ` ${data.rejected} could not be changed (outside your sector).` : ''));
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the duty posting.');
    } finally {
      setSaving(false);
    }
  };

  // Send ticked officers back to Officer Selection (clears zone, sector, sub-sector and point).
  const sendBack = async () => {
    const passIds = [...selected];
    if (!passIds.length) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/deployment/unallot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send the officers back.');
      setNotice(`${data.returned} officer${data.returned === 1 ? '' : 's'} sent back to Officer Selection.`
        + (data.printed ? ` ${data.printed} already had a printed ID card — reprint it after the new allotment.` : '')
        + (data.rejected ? ` ${data.rejected} could not be changed (outside your area).` : ''));
      setSelected(new Set());
      setConfirmSendBack(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the officers back.');
    } finally {
      setSaving(false);
    }
  };

  if (!zones.length) {
    return (
      <div className="operations-panel p-6 text-sm text-slate-600">
        No zone or sector is assigned to your account yet. Ask the SP office to assign one under Team.
      </div>
    );
  }

  const allVisibleSelected = visible.length > 0 && visible.every(officer => selected.has(officer.id));

  return (
    <div className="min-w-0 space-y-4 pb-20">
      {!embedded && <OperationsHeader title="Duty Points" description={isSp
        ? 'Place allotted officers on sub-sectors and duty points across all zones.'
        : 'Place the officers allotted to your zone or sector on sub-sectors and duty points.'} />}

      <div className={`operations-panel grid gap-2 p-3 sm:grid-cols-2 sm:p-4 ${activeSubSectors.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)]'}`}>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Zone</span>
          <CustomSelect ariaLabel="Zone" wrapValue value={zoneName} onChange={value => { setZoneName(value); setSectorFilter(''); }}
            options={zones.map(item => ({ value: item.name, label: `Zone ${item.number}: ${item.name}` }))} />
        </div>
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Sector</span>
          <CustomSelect ariaLabel="Sector" wrapValue searchable value={activeSector} onChange={setSectorFilter}
            options={[...(sectors.length > 1 ? [{ value: '', label: 'All my sectors' }] : []),
              ...sectors.map(item => ({ value: item.number, label: `${item.number}: ${item.name}` }))]} />
        </div>
        {activeSubSectors.length > 0 && (
          <div className="min-w-0 space-y-1">
            <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Sub-sector</span>
            <CustomSelect ariaLabel="Sub-sector" wrapValue searchable value={selectedSubSector}
              onChange={value => (value ? chooseNode({ sector: activeSector, subSector: value }) : setNode(null))}
              options={[{ value: '', label: 'All sub-sectors' }, ...activeSubSectors.map(item => ({ value: item, label: item }))]} />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Force</span>
          <CustomSelect ariaLabel="Force" value={forceFilter} onChange={setForceFilter}
            options={[{ value: '', label: 'All forces' }, ...FORCE_CATEGORIES.map(item => ({ value: item, label: FORCE_LABELS[item] }))]} />
        </div>
      </div>

      <div>
        <section aria-label="Allotted officers" className="operations-panel min-w-0 space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-44 flex-1">
              <span className="sr-only">Search officers</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                placeholder="Search name, ID, mobile or point" className="operations-input pl-9 pr-3" />
            </label>
            <div className="w-36">
              <CustomSelect ariaLabel="Rank" value={rankFilter} onChange={setRankFilter}
                options={[{ value: '', label: 'All ranks' }, ...RANK_GROUPS.map(item => ({ value: item.group, label: item.group }))]} />
            </div>
            <div role="group" aria-label="Placement" className="flex gap-1">
              <PillButton type="button" size="sm" variant={placement === 'unplaced' ? 'secondary' : 'outline'} aria-pressed={placement === 'unplaced'}
                onClick={() => setPlacement('unplaced')}>Not on a point</PillButton>
              <PillButton type="button" size="sm" variant={placement === 'all' ? 'secondary' : 'outline'} aria-pressed={placement === 'all'}
                onClick={() => setPlacement('all')}>All</PillButton>
            </div>
          </div>
          {node && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
              <span>Showing</span>
              <span className="rounded-full bg-police-navy px-2 py-0.5 font-semibold text-white">{node.sector}</span>
              {node.subSector && <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">{node.subSector}</span>}
              {node.point && <span className="rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
                {dutyPointsFor(zoneName, node.sector).find(item => item.code === node.point)?.name ?? 'Point'}</span>}
              <button type="button" className="font-semibold text-police-crimson underline" onClick={() => setNode(null)}>Show whole {activeSector ? 'sector' : 'zone'}</button>
            </p>
          )}
          {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

          <div role="region" aria-label="Officers" tabIndex={0} className="max-h-[50vh] overflow-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-slate-600">
                  <th scope="col" className="px-2 py-2">
                    <input type="checkbox" aria-label="Select all shown officers" checked={allVisibleSelected} disabled={!visible.length}
                      className="size-4 accent-police-crimson"
                      onChange={event => setSelected(event.target.checked ? new Set(visible.map(officer => officer.id)) : new Set())} />
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold">Officer</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Rank</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Posting</th>
                  <th scope="col" className="px-2 py-2 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500">Loading officers…</td></tr>
                ) : !visible.length ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500">
                    {officers.length ? 'No officers in this view.' : 'No officers are allotted here yet. The SP allots officers from Police Force → Officer Selection.'}
                  </td></tr>
                ) : visible.map(officer => {
                  const sector = sectorByNumber(officer.police_sector_number);
                  const sub = subSectorOf(sector, officer);
                  return (
                    <tr key={officer.id} className={selected.has(officer.id) ? 'bg-rose-50/40' : undefined}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" aria-label={`Select ${officer.full_name}`} checked={selected.has(officer.id)}
                          className="size-4 accent-police-crimson"
                          onChange={event => {
                            const checked = event.target.checked;
                            setSelected(current => {
                              const next = new Set(current);
                              if (checked) next.add(officer.id); else next.delete(officer.id);
                              return next;
                            });
                          }} />
                      </td>
                      <th scope="row" className="px-2 py-1.5 font-normal">
                        <span className="block font-semibold text-slate-900">{officer.full_name}</span>
                        <span className="text-slate-500">{[officer.police_id_number, officer.mobile_number, officer.district].filter(Boolean).join(' · ')}</span>
                      </th>
                      <td className="px-2 py-1.5 font-semibold text-police-crimson">{displayRank(officer.rank)}</td>
                      <td className="px-2 py-1.5 text-slate-700">
                        <span className={`block ${officer.police_sector_number ? '' : 'text-rose-700'}`}>
                          {officer.police_sector_number ? `${officer.police_sector_number}${sub ? ` · ${sub}` : ''}` : 'No sector yet'}
                        </span>
                        {officer.police_point_name
                          ? <span className="block text-slate-500">Point: {officer.police_point_name}</span>
                          : <span className="block text-rose-700">No point yet</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {officer.police_point_code && (
                          <PillButton type="button" size="sm" variant="ghost" disabled={saving}
                            icon={<UserMinus aria-hidden="true" className="size-3.5" />}
                            onClick={() => save([officer.id], { sector: officer.police_sector_number ?? '', subSector: sub ?? '', point: '' })}>
                            Remove from point
                          </PillButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
            {(zoneWide || sectors.length > 1) && (
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Post to sector</span>
                <CustomSelect ariaLabel="Post to sector" wrapValue searchable value={targetSector?.number ?? ''} placeholder="Choose sector"
                  onChange={value => setTarget({ sector: value, subSector: '', point: '' })}
                  options={sectors.map(item => ({ value: item.number, label: `${item.number}: ${item.name}` }))} />
              </div>
            )}
            {targetSubSectors.length > 0 && (
              <div className="min-w-0 space-y-1">
                <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Sub-sector</span>
                <CustomSelect ariaLabel="Post to sub-sector" wrapValue searchable value={target.subSector}
                  onChange={value => setTarget(current => ({ ...current, sector: targetSector?.number ?? '', subSector: value, point: '' }))}
                  options={[{ value: '', label: subSectorRequired ? 'Choose a sub-sector' : 'No sub-sector' }, ...targetSubSectors.map(item => ({ value: item, label: item }))]} />
              </div>
            )}
            <div className={`min-w-0 space-y-1 ${targetSubSectors.length ? '' : 'sm:col-span-2'}`}>
              <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Duty point</span>
              <CustomSelect ariaLabel="Post to duty point" wrapValue searchable value={target.point} disabled={!targetSector}
                onChange={value => setTarget(current => ({ ...current, sector: targetSector?.number ?? '', point: value }))}
                options={[{ value: '', label: targetPoints.length ? 'No point (sector / sub-sector only)' : 'No points listed here' },
                  ...targetPoints.map(item => ({ value: item.code, label: item.name }))]} />
            </div>
            {targetSector && (() => {
              // A new point goes into the chosen sector, and into the chosen sub-sector when the sector has them.
              const needsSub = Boolean(targetSector.subSectors?.length);
              const place = needsSub ? target.subSector : targetSector.number;
              const addPoint = async () => {
                setPointBusy(true);
                setError('');
                setNotice('');
                try {
                  const response = await fetch('/api/deployment/points', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zone: zoneName, sectorNumber: targetSector.number, subSector: needsSub ? target.subSector : null, name: newPointName }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error || 'Could not add the duty point.');
                  await reloadPoints();
                  setTarget(current => ({ ...current, sector: targetSector.number, point: data.point.code }));
                  setNotice(`Duty point "${data.point.name}" added to ${targetSector.number}${needsSub ? ` · ${target.subSector}` : ''} and chosen below.`);
                  setNewPointName('');
                  setAddingPoint(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not add the duty point.');
                } finally {
                  setPointBusy(false);
                }
              };
              return (
                <div className="min-w-0 sm:col-span-2" data-points-version={pointsVersion}>
                  {addingPoint ? (
                    <div className="space-y-2 rounded-xl border border-dashed border-police-navy/40 bg-slate-50 p-2.5">
                      <p className="text-xs font-semibold text-slate-700">
                        New duty point in Zone {zone?.number} · {targetSector.number}{needsSub ? ` · ${target.subSector || 'choose a sub-sector above'}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input autoFocus value={newPointName} onChange={event => setNewPointName(event.target.value)} maxLength={255}
                          onKeyDown={event => { if (event.key === 'Enter' && place && newPointName.trim().length >= 2 && !pointBusy) void addPoint(); }}
                          aria-label="New duty point name" placeholder="e.g. Gate No. 3 near canteen"
                          className="operations-input min-w-0 flex-[1_1_16rem] px-3.5" />
                        <PillButton type="button" variant="crimson" size="sm" disabled={pointBusy || !place || newPointName.trim().length < 2}
                          icon={<Plus aria-hidden="true" className="size-3.5" />} onClick={addPoint}>
                          {pointBusy ? 'Adding…' : 'Add point'}
                        </PillButton>
                        <button type="button" aria-label="Cancel adding a duty point" onClick={() => { setAddingPoint(false); setNewPointName(''); }}
                          className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-200"><X className="size-4" /></button>
                      </div>
                      {needsSub && !target.subSector && <p className="text-xs text-amber-800">This sector has sub-sectors: choose the sub-sector above first.</p>}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingPoint(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-police-navy hover:underline">
                      <Plus aria-hidden="true" className="size-3.5" /> Add duty point {needsSub ? 'to a sub-sector' : `to ${targetSector.number}`}
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <PillButton type="button" variant="crimson" disabled={saving || !selected.size || !targetSector}
                icon={<UserCheck aria-hidden="true" className="size-3.5" />}
                onClick={() => save([...selected], { sector: targetSector?.number ?? '', subSector: target.subSector, point: target.point })}>
                {saving ? 'Saving…' : `Post ${selected.size} selected officer${selected.size === 1 ? '' : 's'}`}
              </PillButton>
              <PillButton type="button" variant="outline" disabled={saving || !selected.size}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
                icon={<Undo2 aria-hidden="true" className="size-3.5" />}
                title="Remove the zone, sector, sub-sector and point so they can be selected again"
                onClick={() => setConfirmSendBack(true)}>
                Send {selected.size || ''} back to Officer Selection
              </PillButton>
            </div>
          </div>

          {confirmSendBack && selected.size > 0 && (() => {
            const ticked = officers.filter(officer => selected.has(officer.id));
            const printed = ticked.filter(officer => officer.printed_count > 0 || officer.status === 'PRINTED' || officer.status === 'ISSUED').length;
            return (
              <div role="alertdialog" aria-label="Confirm send back" className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <p>
                  Send <span className="font-semibold">{ticked.length} officer{ticked.length === 1 ? '' : 's'}</span> back to Officer Selection?
                  Their zone, sector, sub-sector and duty point will be removed, and they will show as <span className="font-semibold">Not allotted</span>.
                </p>
                {printed > 0 && (
                  <p className="font-semibold">{printed} of them already have a printed ID card showing this posting. Reprint it after the new allotment.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <PillButton type="button" variant="danger" size="sm" disabled={saving} onClick={() => void sendBack()}>
                    {saving ? 'Sending back…' : 'Yes, send back'}
                  </PillButton>
                  <PillButton type="button" variant="outline" size="sm" disabled={saving} onClick={() => setConfirmSendBack(false)}>Cancel</PillButton>
                </div>
              </div>
            );
          })()}
        </section>
      </div>
      <button type="button" onClick={() => setMapOpen(true)} aria-haspopup="dialog"
        className="no-print fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-police-navy px-4 py-3 text-sm font-semibold text-white shadow-lg ring-4 ring-white/70 transition hover:bg-[#133E6D] focus-visible:outline-none focus-visible:ring-police-crimson/40">
        <MapPinned aria-hidden="true" className="size-4" />
        Sectors &amp; points
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">{officers.length}</span>
      </button>
      {mapOpen && (
        <DutyPointsMapDialog
          zoneName={zoneName}
          zoneNumber={zone?.number}
          sectors={shownSectors}
          counts={counts}
          node={node}
          onChoose={next => (next ? chooseNode(next) : setNode(null))}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}
