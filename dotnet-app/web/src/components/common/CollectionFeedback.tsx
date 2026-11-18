import { AlertCircle, Search, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { PillButton } from './PillButton';

export function CollectionFeedback({ loading, error, onRetry, filtered, onClear }: {
  loading: boolean; error?: string | null; onRetry?: () => void; filtered?: boolean; onClear?: () => void;
}) {
  const Icon = loading ? Loader2 : error ? AlertCircle : Search;
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center" role={error ? 'alert' : 'status'}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Icon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{loading ? 'Loading your workspace…' : error ? 'Records are unavailable' : filtered ? 'No matching passes' : 'Your workspace is ready'}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{loading ? 'Fetching the latest pass records.' : error || (filtered ? 'Try another search or clear your filters to see more records.' : 'New pass records will appear here once they are submitted.')}</p>
      </div>
      {!loading && (error ? <PillButton size="sm" variant="outline" onClick={onRetry}>Try again</PillButton> : filtered && <PillButton size="sm" variant="outline" onClick={onClear}>Clear filters</PillButton>)}
    </div>
  );
}

export function CollectionPagination({ total, page, pageSize, onPageChange, loading }: {
  total: number; page: number; pageSize: number; onPageChange: (page: number) => void; loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500">
      <p aria-live="polite">{loading ? 'Updating records…' : total > 0 ? <>Showing <span className="font-semibold text-slate-700">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)}</span> of <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> records</> : '0 records'}</p>
      <div className="flex items-center gap-2">
        <PillButton size="sm" variant="outline" onClick={() => onPageChange(page - 1)} disabled={loading || page === 0} icon={<ArrowLeft className="h-3.5 w-3.5" />}>Previous</PillButton>
        <span className="px-1 text-[11px] tabular-nums">{page + 1} / {Math.max(1, Math.ceil(total / pageSize))}</span>
        <PillButton size="sm" variant="outline" onClick={() => onPageChange(page + 1)} disabled={loading || (page + 1) * pageSize >= total} icon={<ArrowRight className="h-3.5 w-3.5" />}>Next</PillButton>
      </div>
    </div>
  );
}
