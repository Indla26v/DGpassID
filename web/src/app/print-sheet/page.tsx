'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PrintableDutyCard } from '@/components/badges/PrintableDutyCard';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { PillButton } from '@/components/common/PillButton';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function PrintSheetContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const [passes, setPasses] = useState<PassEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authorizing, setAuthorizing] = useState(false);

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
          const responses = await Promise.all(ids.map(id => fetch(`/api/passes/${id}`, { signal: controller.signal })));
          if (responses.some(response => !response.ok)) throw new Error('One or more selected passes were not found.');
          const list: PassEntity[] = await Promise.all(responses.map(response => response.json()));
          if (list.some(pass => !['READY_TO_PRINT', 'PRINTED'].includes(pass.status))) throw new Error('The sheet requires approved passes.');
          if (!controller.signal.aborted) setPasses(list);
        } else {
          const res = await fetch('/api/print-queue?limit=100', { signal: controller.signal });
          if (!res.ok) throw new Error('Sign in to view the print queue.');
          const data = await res.json();
          if (!controller.signal.aborted) setPasses(data.passes);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load selected passes.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchSelected();
    return () => controller.abort();
  }, [idsParam]);

  const printSheet = async () => {
    setAuthorizing(true);
    setError('');
    try {
      const response = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: passes.map(pass => pass.id), preview: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to authorize the sheet.');
      window.print();
      if (!window.confirm('Did the sheet print successfully?')) return;
      const recorded = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: passes.map(pass => pass.id) }),
      });
      if (!recorded.ok) throw new Error((await recorded.json()).error || 'Unable to record the print batch.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to print the sheet.');
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {/* Control Banner */}
      <div className="no-print max-w-4xl mx-auto mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <Link href="/">
          <PillButton variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Dashboard
          </PillButton>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#0B2545] text-white">
            Front Side Badges
          </span>

          <PillButton
            variant="crimson"
            size="sm"
            onClick={printSheet}
            disabled={loading || authorizing || !passes.length}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            Print Sheet ({passes.length} Cards)
          </PillButton>
        </div>
      </div>
      {error && <p role="alert" className="no-print mx-auto mb-4 max-w-4xl text-sm text-rose-700">{error}</p>}

      {/* Badges Grid (Formatted for Print) */}
      <div className="max-w-5xl mx-auto">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading cards...</div>
        ) : passes.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No cards selected to print.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 justify-items-center">
            {passes.map((pass) => (
              <div key={pass.id} className="page-break-inside-avoid">
                <PrintableDutyCard pass={pass} />
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
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading print sheet...</div>}>
      <PrintSheetContent />
    </Suspense>
  );
}
