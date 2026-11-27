'use client';

import { useEffect, useState } from 'react';
import type { PersonnelImportHistoryEntry } from '@/core/domain/personnel-import-history';
import { CollectionFeedback } from '../common/CollectionFeedback';
import { PillButton } from '../common/PillButton';

export function PersonnelImportHistory({ onReview, disabled }: {
  onReview: (entry: PersonnelImportHistoryEntry) => void;
  disabled: boolean;
}) {
  const [entries, setEntries] = useState<PersonnelImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

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
      {loading || error ? (
        <CollectionFeedback loading={loading} error={error} onRetry={() => setRevision(value => value + 1)} />
      ) : entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-600">No import history has been recorded yet.</p>
      ) : (
        <table className="w-full min-w-[660px] text-left text-xs">
          <caption className="sr-only">The 100 most recent personnel import attempts</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2.5">File</th>
              <th scope="col" className="px-3 py-2.5">Imported by</th>
              <th scope="col" className="px-3 py-2.5 text-right">Detected</th>
              <th scope="col" className="px-3 py-2.5 text-right">Imported</th>
              <th scope="col" className="px-3 py-2.5 text-right">Added</th>
              <th scope="col" className="px-3 py-2.5 text-right">Updated</th>
              <th scope="col" className="px-3 py-2.5 text-right">Needs review</th>
              <th scope="col" className="px-3 py-2.5 text-right">Skipped</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(entry => (
              <tr key={entry.id}>
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="tabular-nums">{entry.needsReview.toLocaleString()}</span>
                    {entry.needsReview > 0 && (
                      <PillButton type="button" size="sm" variant="outline" disabled={disabled}
                        aria-label={`Re-review ${entry.filename}`} onClick={() => onReview(entry)}>
                        Re-review
                      </PillButton>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{entry.skipped.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
