'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import type { PersonnelImportHistoryEntry } from '@/core/domain/personnel-import-history';
import { CollectionFeedback } from '../common/CollectionFeedback';
import { PillButton } from '../common/PillButton';
import { PendingRowsDialog } from './PendingRowsDialog';

export function PersonnelImportHistory({ onReview, disabled }: {
  onReview: (entry: PersonnelImportHistoryEntry) => void;
  disabled: boolean;
}) {
  const [entries, setEntries] = useState<PersonnelImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  // History entry whose flagged rows are open for review.
  const [openId, setOpenId] = useState<number | null>(null);
  // Entry being re-reviewed in the popup.
  const [reviewing, setReviewing] = useState<PersonnelImportHistoryEntry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/police-force/import-history', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load import history.');
        const result = await response.json();
        if (!controller.signal.aborted) setEntries(result.history);
      } catch {
        if (!controller.signal.aborted) setError('Could not load import history.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  return (
    <section id="police-import-history" aria-label="Import history" className="overflow-x-auto rounded-2xl border border-slate-200">
      {reviewing && (
        <PendingRowsDialog entry={reviewing} onClose={() => setReviewing(null)} onChooseFile={() => onReview(reviewing)}
          onChanged={() => setRevision(value => value + 1)} />
      )}
      {loading || error ? (
        <CollectionFeedback loading={loading} error={error} onRetry={() => setRevision(value => value + 1)} />
      ) : entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-600">No import history has been recorded yet.</p>
      ) : (
        <table className="w-full min-w-[760px] text-left text-xs">
          <caption className="sr-only">The 100 most recent personnel import attempts</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2.5">File</th>
              <th scope="col" className="px-3 py-2.5">Imported by</th>
              <th scope="col" className="px-3 py-2.5 text-right">Detected</th>
              <th scope="col" className="px-3 py-2.5 text-right">Imported</th>
              <th scope="col" className="px-3 py-2.5 text-right">Added</th>
              <th scope="col" className="px-3 py-2.5 text-right">Updated</th>
              <th scope="col" className="px-3 py-2.5 text-right">Flagged</th>
              <th scope="col" className="px-3 py-2.5 text-right">Needs review</th>
              <th scope="col" className="px-3 py-2.5 text-right">Skipped</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(entry => {
              const flagged = entry.flagged ?? [];
              const isOpen = openId === entry.id;
              return (
              <React.Fragment key={entry.id}>
              <tr className={isOpen ? 'bg-amber-50/50' : undefined}>
                <th scope="row" className="max-w-56 break-words px-3 py-2.5 font-semibold">
                  {entry.filename}
                  <time dateTime={entry.createdAt} className="block font-normal text-slate-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </th>
                <td className="px-3 py-2.5">{entry.importedBy}</td>
                {[entry.detected, entry.created + entry.updated, entry.created, entry.updated].map((count, index) => (
                  <td key={index} className="px-3 py-2.5 text-right tabular-nums">{count.toLocaleString()}</td>
                ))}
                <td className="px-3 py-2.5 text-right">
                  {flagged.length ? (
                    <button type="button" aria-expanded={isOpen} aria-controls={`import-flagged-${entry.id}`}
                      onClick={() => setOpenId(isOpen ? null : entry.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100">
                      <TriangleAlert aria-hidden="true" className="size-3.5" />
                      {flagged.length.toLocaleString()} · Review
                      <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : <span className="tabular-nums text-slate-400">0</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="tabular-nums">{entry.needsReview.toLocaleString()}</span>
                    {entry.needsReview > 0 && (
                      <PillButton type="button" size="sm" variant="outline" disabled={disabled}
                        aria-label={`Re-review ${entry.filename}`} onClick={() => setReviewing(entry)}>
                        Re-review
                      </PillButton>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{entry.skipped.toLocaleString()}</td>
              </tr>
              {isOpen && (
                <tr id={`import-flagged-${entry.id}`}>
                  <td colSpan={9} className="bg-amber-50/40 px-3 pb-3 pt-1">
                    <p className="mb-1.5 text-xs text-slate-600">
                      These officers were imported, but the value shown was missing or invalid and was left blank. Correct them in the Directory (Edit),
                      or fix the file and import it again.
                    </p>
                    <div className="max-h-80 overflow-auto rounded-xl border border-amber-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-amber-50 text-amber-900">
                          <tr>
                            <th scope="col" className="px-3 py-2">Sheet row</th>
                            <th scope="col" className="px-3 py-2">Officer</th>
                            <th scope="col" className="px-3 py-2">G.No.</th>
                            <th scope="col" className="px-3 py-2">To review</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {flagged.map(item => (
                            <tr key={item.row}>
                              <td className="px-3 py-1.5 tabular-nums text-slate-500">{item.row}</td>
                              <td className="px-3 py-1.5 font-semibold text-slate-900">{item.name || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-600">{item.policeId || '—'}</td>
                              <td className="px-3 py-1.5 text-rose-800">{item.issues.join(' · ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
