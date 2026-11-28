'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FileSpreadsheet, Upload, X } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import type { PendingImportRow, PersonnelImportHistoryEntry } from '@/core/domain/personnel-import-history';
import { StationInput } from './StationInput';
import { usePoliceStations } from './usePoliceStations';
import type { ExistingMatch } from '@/app/api/police-force/import-history/matches/route';

/** Reason saved for rows held back only for their photo (or with no other recorded problem). */
const PHOTO_ONLY = 'Held back for review (photo or details).';
const isPhotoOnly = (item: PendingImportRow) => item.reason === PHOTO_ONLY || /^photo\b/i.test(item.reason);

/** Columns the admin can correct, in the order shown. Other kept details (duty posting, dates…) are sent unchanged. */
const EDITABLE: { field: keyof PendingImportRow['record']; label: string; width: string }[] = [
  { field: 'full_name', label: 'Full name', width: 'min-w-[12rem]' },
  { field: 'rank', label: 'Rank', width: 'w-24' },
  { field: 'police_id_number', label: 'G.No. / Police ID', width: 'w-28' },
  { field: 'mobile_number', label: 'Mobile', width: 'w-32' },
  { field: 'govt_id_number', label: 'Aadhaar', width: 'w-36' },
  { field: 'police_unit_district', label: 'District / unit', width: 'w-32' },
  { field: 'police_station', label: 'Police station', width: 'w-32' },
];

/**
 * Re-review of an import: the rows that were held back, kept with the history entry, shown in a popup where the
 * admin corrects the details and imports them. No file needed. Older entries (saved before rows were kept) explain
 * that and offer to choose the file instead.
 */
export function PendingRowsDialog({ entry, onClose, onChooseFile, onChanged }: {
  entry: PersonnelImportHistoryEntry;
  onClose: () => void;
  onChooseFile: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<PendingImportRow[]>(() => entry.pending ?? []);
  const masterStations = usePoliceStations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Officers already saved that share an Aadhaar, mobile, or G.No + name with a row (looked up as details change).
  const [matches, setMatches] = useState<Record<number, ExistingMatch[]>>({});
  const probeKey = rows.map(item => [item.row, item.record.govt_id_number, item.record.mobile_number, item.record.police_id_number, item.record.full_name].join('~')).join('|');
  useEffect(() => {
    if (!rows.length) { setMatches({}); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch('/api/police-force/import-history/matches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ rows: rows.map(item => ({ row: item.row, aadhaar: item.record.govt_id_number, mobile: item.record.mobile_number,
          name: item.record.full_name, policeId: item.record.police_id_number })) }),
      }).then(response => (response.ok ? response.json() : { matches: {} }))
        .then(data => setMatches(data.matches ?? {}))
        .catch(() => undefined);
    }, 400);
    return () => { controller.abort(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);
  // The same Aadhaar or mobile on more than one row of this list.
  const repeats = useMemo(() => {
    const digits = (value?: string) => (value ?? '').replace(/\D/g, '');
    const group = (pick: (item: PendingImportRow) => string, min: number) => {
      const byValue = new Map<string, number[]>();
      for (const item of rows) {
        const value = pick(item);
        if (value.length >= min) byValue.set(value, [...(byValue.get(value) ?? []), item.row]);
      }
      return byValue;
    };
    return {
      aadhaar: group(item => digits(item.record.govt_id_number), 12),
      mobile: group(item => digits(item.record.mobile_number).slice(-10), 10),
      digits,
    };
  }, [rows]);
  const othersWith = (map: Map<string, number[]>, value: string, row: number) => (map.get(value) ?? []).filter(other => other !== row);

  const edit = (row: number, field: keyof PendingImportRow['record'], value: string) =>
    setRows(current => current.map(item => (item.row === row ? { ...item, record: { ...item.record, [field]: value } } : item)));

  const importRows = async (targets: PendingImportRow[]) => {
    const ready = targets.filter(item => item.record.full_name?.trim());
    if (!ready.length) { setError('Enter the officer’s full name first.'); return; }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/passes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowIncomplete: true, records: ready.map(item => ({ ...item.record, institution_other: item.record.police_unit_district })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not import the rows.');
      // "Row n: message" refers to the n-th record sent.
      const failed = new Map<number, string>();
      for (const message of (result.errors ?? []) as string[]) {
        const match = message.match(/^Row (\d+):\s*(.*)$/s);
        const item = match && ready[Number(match[1]) - 1];
        if (item) failed.set(item.row, match[2]);
      }
      const importedRows = ready.filter(item => !failed.has(item.row)).map(item => item.row);
      // Rows imported with a problem (bad mobile / Aadhaar left blank, or a possible duplicate officer).
      const flagged = new Map<number, { row: number; name: string; policeId: string; issues: string[] }>();
      for (const message of (result.flags ?? []) as string[]) {
        const match = message.match(/^Row (\d+):\s*(.*)$/s);
        const item = match && ready[Number(match[1]) - 1];
        if (!item) continue;
        flagged.set(item.row, {
          row: item.row, name: (item.record.full_name ?? '').slice(0, 200), policeId: (item.record.police_id_number ?? '').slice(0, 64),
          issues: match[2].split(' | ').slice(0, 6).map(issue => issue.slice(0, 300)),
        });
      }
      const remaining = rows
        .filter(item => !importedRows.includes(item.row))
        .map(item => (failed.has(item.row) ? { ...item, reason: failed.get(item.row)! } : item));
      const saved = await fetch('/api/police-force/import-history', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, importedRows, pending: remaining, flagged: [...flagged.values()], created: result.created ?? 0, updated: result.updated ?? 0 }),
      });
      if (!saved.ok) throw new Error((await saved.json().catch(() => ({}))).error || 'Imported, but the history could not be updated.');
      setRows(remaining);
      setNotice(`${importedRows.length} row${importedRows.length === 1 ? '' : 's'} imported${failed.size ? `; ${failed.size} still need attention` : ''}.`
        + `${flagged.size ? ` ${flagged.size} flagged for review (see Flagged in the import history).` : ''}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import the rows.');
    } finally {
      setBusy(false);
    }
  };

  const hasRows = Boolean(entry.pending?.length);
  return createPortal(
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pending-rows-title"
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 bg-police-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Re-review import</p>
            <h3 id="pending-rows-title" className="truncate text-lg font-semibold">{entry.filename}</h3>
            <p className="text-xs text-slate-300">{new Date(entry.createdAt).toLocaleString()} · by {entry.importedBy}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="size-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
          {!hasRows ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>
                This import was saved before the app kept the rows that were held back, so only its totals are stored
                ({entry.needsReview.toLocaleString()} rows needed review). Choose the same file to review and import those rows.
              </p>
              <PillButton type="button" variant="crimson" size="sm" icon={<FileSpreadsheet aria-hidden="true" className="size-3.5" />}
                onClick={() => { onClose(); onChooseFile(); }}>
                Choose the file
              </PillButton>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Correct the details and import. {rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} left.` : 'All rows have been imported.'}
                {' '}Duty posting and other details from the file are kept as they were.
              </p>
              {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
              {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
              {rows.length > 0 && (
                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700">
                      <tr>
                        <th scope="col" className="px-2 py-2">Row</th>
                        {EDITABLE.map(column => <th key={column.field} scope="col" className="px-2 py-2">{column.label}</th>)}
                        <th scope="col" className="px-2 py-2">Problem</th>
                        <th scope="col" className="px-2 py-2"><span className="sr-only">Import</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(item => (
                        <React.Fragment key={item.row}>
                        <tr className="align-top">
                          <td className="px-2 py-2 tabular-nums text-slate-500">{item.row}</td>
                          {EDITABLE.map(column => (
                            <td key={column.field} className="px-1.5 py-1.5">
                              {column.field === 'police_station' ? (
                                <StationInput value={item.record.police_station ?? ''} onChange={value => edit(item.row, 'police_station', value)}
                                  district={item.record.police_unit_district} stations={masterStations} disabled={busy}
                                  ariaLabel={`${column.label}, row ${item.row}`}
                                  className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20" />
                              ) : (
                                <input value={item.record[column.field] ?? ''} onChange={event => edit(item.row, column.field, event.target.value)}
                                  aria-label={`${column.label}, row ${item.row}`} disabled={busy} maxLength={255}
                                  className={`${column.width} rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-police-navy focus:outline-none focus:ring-2 focus:ring-police-navy/20`} />
                              )}
                            </td>
                          ))}
                          <td className={`min-w-[18rem] px-2 py-2 leading-snug ${isPhotoOnly(item) ? 'text-emerald-800' : 'text-rose-800'}`}>
                            {isPhotoOnly(item) ? 'Ready: photo will be captured at ID card print.' : item.reason}
                          </td>
                          <td className="px-2 py-1.5">
                            <PillButton type="button" size="sm" variant="outline" disabled={busy} onClick={() => importRows([item])}>Import</PillButton>
                          </td>
                        </tr>
                        {(() => {
                          const saved = matches[item.row] ?? [];
                          const aadhaar = repeats.digits(item.record.govt_id_number);
                          const mobile = repeats.digits(item.record.mobile_number).slice(-10);
                          const sameAadhaar = aadhaar.length === 12 ? othersWith(repeats.aadhaar, aadhaar, item.row) : [];
                          const sameMobile = mobile.length === 10 ? othersWith(repeats.mobile, mobile, item.row) : [];
                          if (!saved.length && !sameAadhaar.length && !sameMobile.length) return null;
                          return (
                            <tr className="bg-amber-50/70">
                              <td />
                              <td colSpan={9} className="px-2 pb-2 pt-0">
                                <ul className="space-y-0.5 text-xs text-amber-950">
                                  {saved.map(officer => (
                                    <li key={officer.pass_number} className="flex flex-wrap items-center gap-x-1.5">
                                      <Copy aria-hidden="true" className="size-3.5 text-amber-700" />
                                      <span className="font-semibold">Same {officer.same.join(' and ')}</span>
                                      <span>as saved officer</span>
                                      <span className="font-semibold">{officer.pass_number}</span>
                                      <span>· {officer.rank ?? ''} {officer.full_name} · G.No {officer.police_id_number || '-'}
                                        {' '}· Mobile {officer.mobile_number || '-'} · Aadhaar {officer.govt_id_number || '-'}
                                        {officer.police_unit_district ? ` · ${officer.police_unit_district}` : ''}</span>
                                    </li>
                                  ))}
                                  {sameAadhaar.length > 0 && (
                                    <li className="flex items-center gap-1.5"><Copy aria-hidden="true" className="size-3.5 text-amber-700" />
                                      <span><span className="font-semibold">Same Aadhaar {aadhaar}</span> also on row{sameAadhaar.length === 1 ? '' : 's'} {sameAadhaar.join(', ')} of this list</span></li>
                                  )}
                                  {sameMobile.length > 0 && (
                                    <li className="flex items-center gap-1.5"><Copy aria-hidden="true" className="size-3.5 text-amber-700" />
                                      <span><span className="font-semibold">Same mobile {mobile}</span> also on row{sameMobile.length === 1 ? '' : 's'} {sameMobile.join(', ')} of this list</span></li>
                                  )}
                                </ul>
                              </td>
                            </tr>
                          );
                        })()}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <PillButton type="button" variant="outline" onClick={onClose} disabled={busy}>Close</PillButton>
          {hasRows && rows.some(isPhotoOnly) && rows.some(item => !isPhotoOnly(item)) && (
            <PillButton type="button" variant="outline" disabled={busy} onClick={() => importRows(rows.filter(isPhotoOnly))}>
              Import {rows.filter(isPhotoOnly).length} ready (photo at print)
            </PillButton>
          )}
          {hasRows && rows.length > 0 && (
            <PillButton type="button" variant="crimson" disabled={busy} icon={<Upload aria-hidden="true" className="size-4" />} onClick={() => importRows(rows)}>
              {busy ? 'Importing…' : `Import all ${rows.length}`}
            </PillButton>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
