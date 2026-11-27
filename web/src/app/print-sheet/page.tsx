'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PrintableDutyCard } from '@/components/badges/PrintableDutyCard';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { CAMPUS_PRINT_ZONE_REQUIRED, needsCampusPrintZone } from '@/core/domain/zones';
import { PillButton } from '@/components/common/PillButton';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { openPrintDialog } from '@/lib/print-helper';
import { PrintOutcome } from '@/components/print/PrintOutcome';
import { usePrintOutcome } from '@/components/print/usePrintOutcome';
import { AuthProvider } from '@/auth/AuthProvider';
import { fetchPrintDetails } from '@/lib/print-details';

function PrintSheetContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const [passes, setPasses] = useState<PassEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const selection = { ids: passes.map(pass => pass.id) };
  const unassigned = passes.find(needsCampusPrintZone);
  const outcome = usePrintOutcome<{ successCount: number }>(
    result => {
      setSavedCount(result.successCount);
      setRefreshVersion(version => version + 1);
    },
  );

  useEffect(() => setSavedCount(null), [idsParam]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchSelected = async () => {
      try {
        setLoading(true);
        setError('');
        setPasses([]);
        if (idsParam) {
          const ids = [...new Set(idsParam.split(',').map(id => id.trim()))];
          if (ids.length > 100 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Select up to 100 valid passes.');
          const list = await fetchPrintDetails(ids, controller.signal);
          if (list.some(pass => pass.pass_type === 'POLICE_FORCE' || pass.is_imported)) throw new Error('Open Police Force to print police badges.');
          if (list.some(pass => !['READY_TO_PRINT', 'PRINTED'].includes(pass.status))) throw new Error('The sheet requires approved passes.');
          if (!controller.signal.aborted) setPasses(list);
        } else {
          const res = await fetch('/api/print-queue?limit=100', { signal: controller.signal });
          if (!res.ok) throw new Error('Sign in to view the print queue.');
          const data = await res.json();
          const ids: string[] = data.passes.map((pass: PassEntity) => pass.id);
          const list = ids.length ? await fetchPrintDetails(ids, controller.signal) : [];
          if (!controller.signal.aborted) setPasses(list);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load selected passes.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchSelected();
    return () => controller.abort();
  }, [idsParam, refreshVersion]);

  return (
    <div className="bulk-print-document min-h-screen bg-slate-100 p-6">
      {outcome.count !== null ? (
        <div className="no-print mx-auto mb-6 max-w-4xl">
          <PrintOutcome count={outcome.count} saving={outcome.phase === 'saving'} error={outcome.error}
            onPrinted={outcome.confirm} onNotPrinted={outcome.dismiss} />
        </div>
      ) : (
      <div className="no-print max-w-4xl mx-auto mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800"
          onClick={event => { if (outcome.locked) event.preventDefault(); }}
          aria-disabled={outcome.locked}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#0B2545] text-white">
            Front Side Badges
          </span>

          <PillButton
            variant="crimson"
            size="sm"
            onClick={() => {
              setSavedCount(null);
              void outcome.start(selection, passes, async () => {
                const sheet = sheetRef.current;
                if (!sheet) throw new Error('Could not prepare the print sheet.');
                sheet.classList.remove('no-print');
                sheet.classList.add('bulk-print-active');
                try {
                  await openPrintDialog();
                } finally {
                  sheet.classList.remove('bulk-print-active');
                  sheet.classList.add('no-print');
                }
              });
            }}
            disabled={loading || outcome.locked || !passes.length || Boolean(unassigned)}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            Print Sheet ({passes.length} Cards)
          </PillButton>
        </div>
      </div>
      )}
      {error && <p role="alert" className="no-print mx-auto mb-4 max-w-4xl text-sm text-rose-700">{error}</p>}
      {unassigned && <p role="status" className="no-print mx-auto mb-4 max-w-4xl text-sm text-amber-900">{unassigned.pass_number} · {CAMPUS_PRINT_ZONE_REQUIRED}</p>}
      {outcome.count === null && outcome.error && (
        <p role="alert" className="no-print mx-auto mb-4 max-w-4xl text-sm text-rose-700">{outcome.error}</p>
      )}
      {outcome.count === null && savedCount !== null && (
        <p role="status" className="no-print mx-auto mb-4 max-w-4xl text-sm text-emerald-800">
          Recorded {savedCount} {savedCount === 1 ? 'badge' : 'badges'} as printed.
        </p>
      )}

      {/* Badges Grid (Formatted for Print) */}
      <div ref={sheetRef} className="no-print max-w-5xl mx-auto">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading cards...</div>
        ) : passes.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No cards selected to print.</div>
        ) : (
          <div className="bulk-print-page-list grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 justify-items-center">
            {passes.map((pass) => (
              <div key={pass.id} className="bulk-print-page">
                <PrintableDutyCard pass={pass} printDate={outcome.printDate} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintSheetPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading print sheet...</div>}>
        <PrintSheetContent />
      </Suspense>
    </AuthProvider>
  );
}
