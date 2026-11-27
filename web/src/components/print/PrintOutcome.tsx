'use client';

import { useEffect, useRef } from 'react';
import { PillButton } from '../common/PillButton';

interface PrintOutcomeProps {
  count: number;
  saving: boolean;
  error: string;
  onPrinted: () => void;
  onNotPrinted: () => void;
}

export function PrintOutcome({ count, saving, error, onPrinted, onNotPrinted }: PrintOutcomeProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [saving]);

  return (
    <section className="no-print rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-bold">
        {count === 1 ? 'Did the badge print?' : `Did all ${count} badges print?`}
      </h2>
      <p className="mt-1 text-sm">Choose the print outcome before continuing.</p>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <PillButton variant="crimson" onClick={onPrinted} disabled={saving}>
          {saving ? 'Saving…' : count === 1 ? 'Printed' : 'All Printed'}
        </PillButton>
        <PillButton variant="secondary" onClick={onNotPrinted} disabled={saving}>
          Cancelled / Not Printed
        </PillButton>
      </div>
    </section>
  );
}
