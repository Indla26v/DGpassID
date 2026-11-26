'use client';

import { FORCE_LABELS, normalizeForce } from '@/core/domain/ranks';
import React, { useMemo, useRef, useState } from 'react';
import { PillButton } from '../common/PillButton';
import { parsePoliceRoster, readPoliceRosterPhoto, type PoliceRosterRow } from '@/lib/police-roster-import';
import { photoBlob, resolveReviewPhoto, rosterDetailsIssue, type PhotoOverride } from '@/lib/roster-import-review';
import { cleanAadhaarNumber, DUPLICATE_ROSTER_AADHAAR, repeatedAadhaarNumbers } from '@/lib/identity-validation';
import { CollectionPagination } from '../common/CollectionFeedback';
import { RosterPhotoPreview, RosterRowReview } from './RosterRowReview';
import { RosterImportHistory } from './RosterImportHistory';
import type { RosterImportHistoryEntry, RosterImportSummary } from '@/core/domain/roster-import-history';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  History,
  Search,
} from 'lucide-react';

interface WaveImportCenterProps {
  onSuccess: () => void;
  onViewDirectory: () => void;
}

const PAGE_SIZE = 10;
const rosterExtensions = '.xlsx,.xls,.csv';
const photoLabels = {
  embedded: 'Embedded', chosen: 'Selected', replacement: 'Replacement',
  link: 'Photo link', defer: 'Desk capture', review: 'Review photo',
};

export const WaveImportCenter: React.FC<WaveImportCenterProps> = ({ onSuccess, onViewDirectory }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewFileInputRef = useRef<HTMLInputElement>(null);
  const historyEntryRef = useRef<RosterImportHistoryEntry | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PoliceRosterRow[]>([]);
  const [photoOverrides, setPhotoOverrides] = useState<Record<number, PhotoOverride | undefined>>({});
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [imported, setImported] = useState<Set<number>>(() => new Set());
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [reviewRow, setReviewRow] = useState<PoliceRosterRow | null>(null);
  const [search, setSearch] = useState('');
  const [rowFilter, setRowFilter] = useState<'all' | 'review' | 'remaining'>('all');
  const [resumeNotice, setResumeNotice] = useState('');
  const [page, setPage] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    updated: number;
    total: number;
  } | null>(null);

  const stagedRows = useMemo(() => {
    const selectedRows = rows.filter(row => !excluded.has(row.sourceRow));
    const duplicates = repeatedAadhaarNumbers(selectedRows.map(row => row.record.govt_id_number));
    return rows.map(row => {
      const photo = resolveReviewPhoto(row, photoOverrides[row.sourceRow]);
      const duplicate = !excluded.has(row.sourceRow) && duplicates.has(cleanAadhaarNumber(row.record.govt_id_number));
      const issue = duplicate ? DUPLICATE_ROSTER_AADHAAR
        : rosterDetailsIssue(row) || (photo.kind === 'review' ? photo.message : '');
      return { row, photo, issue };
    });
  }, [rows, excluded, photoOverrides]);
  const candidates = stagedRows.filter(({ row, issue }) =>
    !excluded.has(row.sourceRow) && !imported.has(row.sourceRow) && !issue && !rowErrors[row.sourceRow]);
  const totalParsedRows = rows.length;
  const needsReview = stagedRows.filter(({ row, issue }) =>
    !excluded.has(row.sourceRow) && !imported.has(row.sourceRow) && (issue || rowErrors[row.sourceRow])).length;
  const query = search.trim().toLowerCase();
  const filteredRows = stagedRows.filter(({ row, issue }) =>
    (rowFilter === 'all' || (!excluded.has(row.sourceRow) && !imported.has(row.sourceRow) &&
      (rowFilter === 'remaining' || Boolean(issue || rowErrors[row.sourceRow])))) &&
    (!query || [row.sourceRow.toString(), row.record.full_name, row.record.police_id_number, row.record.mobile_number,
      row.record.police_zone, row.record.police_sector_name].some(value => value.toLowerCase().includes(query))));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredRows.length / PAGE_SIZE) - 1));
  const parsedPreview = filteredRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const resetFileReview = (file: File | null) => {
    fingerprintRef.current = null;
    setSelectedFile(file);
    setUploadError(null);
    setUploadResult(null);
    setRows([]);
    setPhotoOverrides({});
    setExcluded(new Set());
    setImported(new Set());
    setRowErrors({});
    setReviewRow(null);
    setSearch('');
    setRowFilter('all');
    setResumeNotice('');
    setPage(0);
  };

  const clearFile = () => {
    resetFileReview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.focus();
    }
  };

  const loadFile = async (file: File, historyEntry?: RosterImportHistoryEntry | null) => {
    resetFileReview(file);
    setIsParsing(true);
    try {
      const contents = await file.arrayBuffer();
      const digest = await globalThis.crypto?.subtle?.digest('SHA-256', contents);
      const fingerprint = digest
        ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
        : null;
      const parsed = parsePoliceRoster(contents);
      fingerprintRef.current = fingerprint;
      if (historyEntry) {
        const progress = historyEntry.resume;
        if (progress && fingerprint === progress.fingerprint) {
          const sourceRows = new Set(parsed.map(row => row.sourceRow));
          setImported(new Set(progress.importedRows.filter(row => sourceRows.has(row))));
          setExcluded(new Set(progress.skippedRows.filter(row => sourceRows.has(row))));
          setResumeNotice('Review the remaining rows. Previously imported and skipped rows are hidden from this view.');
        } else {
          setResumeNotice(progress
            ? 'This workbook differs from the saved import. All rows are available to review.'
            : 'This older history entry contains totals only. All rows are available to review.');
        }
        setRowFilter('remaining');
        setShowHistory(false);
      }
      setRows(parsed);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not read the roster.');
    } finally {
      setIsParsing(false);
    }
  };

  const reopenReview = (entry: RosterImportHistoryEntry) => {
    historyEntryRef.current = entry;
    reviewFileInputRef.current?.click();
  };

  const handleUploadFile = async () => {
    if (!selectedFile || !candidates.length || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    setHistoryError('');

    let created = 0;
    let updated = 0;
    const errors: Record<number, string> = {};
    const saved = new Set<number>();
    const batch: { sourceRow: number; json: string }[] = [];
    let batchSize = 0;

    const submit = async () => {
      if (!batch.length) return;
      const response = await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `{"records":[${batch.map(row => row.json).join(',')}]}`,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not import the roster.');
      const failed = new Set<number>();
      for (const error of result.errors as string[]) {
        const match = error.match(/^Row (\d+):\s*(.*)$/s);
        const row = match && batch[Number(match[1]) - 1];
        if (!row) throw new Error(error);
        errors[row.sourceRow] = match[2];
        failed.add(row.sourceRow);
      }
      for (const { sourceRow } of batch) {
        if (!failed.has(sourceRow)) saved.add(sourceRow);
      }
      created += result.created;
      updated += result.updated;
      batch.length = 0;
      batchSize = 0;
    };

    try {
      for (const { row: { record, sourceRow, dutyEdited }, photo } of candidates) {
        let photoUrl = photo.kind === 'link' ? photo.url : undefined;
        const photoFile = photoBlob(photo);
        if (photoFile) {
          try {
            photoUrl = await readPoliceRosterPhoto(photoFile);
          } catch {
            errors[sourceRow] = 'The photo could not be read. Upload a JPG, PNG or WebP up to 20 MB.';
            continue;
          }
        }

        // Duty columns are optional: rows without them keep any existing allotment.
        const { police_zone, police_sector_number, police_sector_name, police_point_code, police_point_name, ...officer } = record;
        const duty = dutyEdited || police_zone || police_sector_number || police_sector_name
          ? { police_zone, police_sector_number, police_sector_name, police_point_code, police_point_name }
          : {};
        const json = JSON.stringify({ ...officer, ...duty, photo_url: photoUrl });
        if (batch.length >= 100 || batchSize + json.length > 1_500_000) await submit();
        batch.push({ sourceRow, json });
        batchSize += json.length;
      }
      await submit();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Import stopped. Try again.');
    } finally {
      setImported(current => new Set([...current, ...saved]));
      setRowErrors(current => {
        const next = { ...current, ...errors };
        saved.forEach(row => { delete next[row]; });
        return next;
      });
      if (created || updated || Object.keys(errors).length) setUploadResult({ created, updated, total: created + updated });
      if (created || updated) onSuccess();
      const summary: RosterImportSummary = {
        filename: selectedFile.name,
        detected: rows.length,
        created,
        updated,
        needsReview: rows.length - excluded.size - imported.size - saved.size,
        skipped: excluded.size,
      };
      if (fingerprintRef.current) {
        summary.resume = {
          fingerprint: fingerprintRef.current,
          importedRows: [...imported, ...saved],
          skippedRows: [...excluded],
        };
      }
      try {
        const response = await fetch('/api/police-force/import-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summary),
        });
        if (!response.ok) throw new Error('History was not saved.');
        setHistoryRevision(value => value + 1);
      } catch {
        setHistoryError('Could not save this import summary to history.');
      }
      setIsUploading(false);
    }
  };

  const saveRow = (updated: PoliceRosterRow, photoOverride: PhotoOverride | undefined) => {
    setRows(current => current.map(item => item.sourceRow === updated.sourceRow ? updated : item));
    setPhotoOverrides(current => ({ ...current, [updated.sourceRow]: photoOverride }));
    setRowErrors(current => {
      const next = { ...current };
      delete next[updated.sourceRow];
      return next;
    });
    setReviewRow(null);
  };

  return (
    <div className="operations-panel operations-enter space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#8B1A1A]" />
          <h3 className="text-base font-bold text-[#0B2545]">
            Direct File Import
          </h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Import officer proforma details, Bandobusth assignments and photos from one roster.
        </p>
        </div>
        <PillButton type="button" variant="outline" size="sm" aria-expanded={showHistory}
          aria-controls={showHistory ? 'police-import-history' : undefined}
          onClick={() => setShowHistory(value => !value)} icon={<History className="size-4" />}>
          {showHistory ? 'Hide history' : 'Import history'}
        </PillButton>
      </div>
      {showHistory && <RosterImportHistory key={historyRevision} onReview={reopenReview} disabled={isParsing || isUploading} />}
      <input ref={reviewFileInputRef} type="file" accept={rosterExtensions} hidden
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (fileInputRef.current) fileInputRef.current.value = '';
          void loadFile(file, historyEntryRef.current);
        }} />

      {/* Upload Controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Choose roster file"
            accept={rosterExtensions}
            disabled={isParsing || isUploading}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
            className="max-w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#0B2545] file:text-white hover:file:bg-[#0B2545]/90 cursor-pointer"
          />
          {selectedFile && (
            <PillButton type="button" variant="outline" size="md"
              disabled={isParsing || isUploading} onClick={clearFile}>
              {imported.size ? 'Clear file' : 'Cancel'}
            </PillButton>
          )}
          <PillButton
            variant="crimson"
            size="md"
            disabled={!candidates.length || isUploading || Boolean(reviewRow)}
            onClick={handleUploadFile}
            icon={isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          >
            {isUploading ? 'Importing…' : isParsing ? 'Reading roster…' : totalParsedRows > 0
              ? `Import ${candidates.length} ready ${candidates.length === 1 ? 'row' : 'rows'}` : 'Import roster'}
          </PillButton>
        </div>

        {selectedFile && totalParsedRows > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <FileSpreadsheet className="h-4 w-4 text-[#8B1A1A]" />
            <span>
              Selected: <strong className="text-slate-800">{selectedFile.name}</strong> ({totalParsedRows} records detected)
            </span>
          </div>
        )}
      </div>

      {totalParsedRows > 0 && (
        <section aria-labelledby="police-roster-review" className="space-y-3">
          {resumeNotice && <p className="text-xs text-slate-600" role="status">{resumeNotice}</p>}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h4 id="police-roster-review" className="text-sm font-semibold text-police-navy">Review roster</h4>
              <p className="mt-1 text-xs text-slate-600" role="status">
                {candidates.length} ready · {needsReview} to review · {excluded.size} skipped · {imported.size} imported
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <span className="sr-only">Search roster</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input type="search" className="operations-input min-h-8 pl-9" value={search}
                  onChange={event => { setSearch(event.target.value); setPage(0); }}
                  placeholder="Find row, name, or Police ID" />
              </label>
              <PillButton size="sm" variant={rowFilter === 'all' ? 'primary' : 'outline'} aria-pressed={rowFilter === 'all'}
                onClick={() => { setRowFilter('all'); setPage(0); }}>All rows</PillButton>
              {(resumeNotice || imported.size > 0) && (
                <PillButton size="sm" variant={rowFilter === 'remaining' ? 'primary' : 'outline'} aria-pressed={rowFilter === 'remaining'}
                  onClick={() => { setRowFilter('remaining'); setSearch(''); setPage(0); }}>Remaining rows</PillButton>
              )}
              <PillButton size="sm" variant={rowFilter === 'review' ? 'primary' : 'outline'} aria-pressed={rowFilter === 'review'}
                onClick={() => { setRowFilter('review'); setSearch(''); setPage(0); }}>Needs review ({needsReview})</PillButton>
            </div>
          </div>
          <div className="max-h-[min(65vh,42rem)] overflow-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2">Include</th>
                  <th scope="col" className="px-3 py-2">Photograph</th>
                  <th scope="col" className="px-3 py-2">Officer</th>
                  <th scope="col" className="px-3 py-2">District / station / force</th>
                  <th scope="col" className="px-3 py-2">Duty assignment</th>
                  <th scope="col" className="px-3 py-2 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {parsedPreview.map(({ row, photo, issue }) => {
                  const { record, sourceRow } = row;
                  const isImported = imported.has(sourceRow);
                  const isExcluded = excluded.has(sourceRow);
                  const message = issue || rowErrors[sourceRow];
                  return (
                    <tr key={sourceRow} className={message && !isImported ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/70'}>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <input type="checkbox" aria-label={`Include row ${sourceRow}`} checked={!isExcluded}
                            disabled={isImported || isUploading}
                            className="size-4 accent-police-crimson"
                            onChange={event => {
                              const checked = event.target.checked;
                              setExcluded(current => {
                                const next = new Set(current);
                                if (checked) next.delete(sourceRow);
                                else next.add(sourceRow);
                                return next;
                              });
                            }} />
                          <span className="text-slate-500">Row {sourceRow}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" disabled={isImported || isUploading} aria-label={`Review photograph for row ${sourceRow}`}
                          onClick={() => setReviewRow(row)} className="inline-flex items-center gap-2 rounded-xl text-left hover:text-police-crimson">
                          <RosterPhotoPreview photo={photo} label={`Photo for ${record.full_name || 'row ' + sourceRow}`} />
                          <span>{photoLabels[photo.kind]}</span>
                        </button>
                      </td>
                      <th scope="row" className="px-3 py-2 font-normal">
                        <p className="font-semibold text-police-navy">{record.full_name || 'Missing name'}</p>
                        <p className="text-slate-500">{[record.rank, record.police_id_number, record.mobile_number].filter(Boolean).join(' · ')}</p>
                      </th>
                      <td className="px-3 py-2">
                        <p>{record.police_unit_district || '—'}</p>
                        {record.police_station && <p className="text-slate-500">{record.police_station}</p>}
                        {(record.force_category || record.gender) && (
                          <p className="text-slate-500">{[record.force_category && FORCE_LABELS[normalizeForce(record.force_category, record.rank)], record.gender].filter(Boolean).join(' · ')}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{record.police_zone || 'Unassigned'}</p>
                        {record.police_sector_name && <p className="text-slate-500">{record.police_sector_number} · {record.police_sector_name}</p>}
                        {record.police_point_name && <p className="text-slate-500">Point: {record.police_point_name}</p>}
                        {row.dutyWarning && !isImported && <p className="mt-0.5 max-w-60 text-amber-800">{row.dutyWarning}</p>}
                        {message && !isImported && <p className="mt-0.5 max-w-60 text-rose-800">{message}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isImported ? <span className="font-semibold text-emerald-800">Imported</span> :
                          <PillButton type="button" size="sm" variant="outline" disabled={isUploading}
                            aria-label={`Review row ${sourceRow}`} onClick={() => setReviewRow(row)}>
                            {isExcluded ? 'Skipped · Review' : message ? 'Review' : 'Edit row'}
                          </PillButton>}
                      </td>
                    </tr>
                  );
                })}
                {!parsedPreview.length && <tr><td colSpan={6} className="p-5 text-center text-slate-600">No rows match this view.</td></tr>}
              </tbody>
            </table>
          </div>
          <CollectionPagination total={filteredRows.length} page={currentPage} pageSize={PAGE_SIZE} onPageChange={setPage} loading={false} />
        </section>
      )}
      {reviewRow && (
        <RosterRowReview key={reviewRow.sourceRow} row={reviewRow} photoOverride={photoOverrides[reviewRow.sourceRow]}
          onClose={() => setReviewRow(null)} onSave={saveRow} />
      )}

      {/* Upload Error Alert */}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{uploadError}</span>
        </div>
      )}
      {historyError && <p role="alert" className="text-xs text-rose-800">{historyError}</p>}

      {/* Upload Success Alert */}
      {uploadResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 text-xs text-emerald-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{Object.keys(rowErrors).length || uploadError ? 'Import results' : 'Personnel file imported'}</span>
            </div>
            {imported.size > 0 && <PillButton size="sm" variant="outline" disabled={isUploading} onClick={onViewDirectory}>View Force Directory</PillButton>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-bold">
            <div className="rounded-xl border border-emerald-200 bg-white p-2.5 text-center sm:text-left">
              <span className="text-slate-500 font-medium text-[11px] block">New Officers Added</span>
              <span className="text-base text-emerald-700">{uploadResult.created}</span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-2.5 text-center sm:text-left">
              <span className="text-slate-500 font-medium text-[11px] block">Existing Officers Updated</span>
              <span className="text-base text-indigo-700">{uploadResult.updated}</span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-2.5 text-center sm:text-left">
              <span className="text-slate-500 font-medium text-[11px] block">Total Processed</span>
              <span className="text-base text-[#0B2545]">{uploadResult.total}</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
