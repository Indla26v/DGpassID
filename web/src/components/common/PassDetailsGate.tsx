'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { PassEntity } from '@/core/domain/entities/pass.entity';
import { useDialog } from './useDialog';
import { PillButton } from './PillButton';

export function PassDetailsGate({ id, onClose, children }: {
  id: string;
  onClose: () => void;
  children: (pass: PassEntity) => ReactNode;
}) {
  const [pass, setPass] = useState<PassEntity | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const dialog = useDialog(!pass, onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/passes/${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load the pass details.');
        const details: PassEntity = await response.json();
        if (!controller.signal.aborted) setPass(details);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load the pass details.');
      });
    return () => controller.abort();
  }, [id, retry]);

  if (pass) return children(pass);
  return (
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Pass details" tabIndex={-1}
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl">
        <p role={error ? 'alert' : 'status'} className="text-sm text-slate-700">{error || 'Loading pass details…'}</p>
        <div className="flex justify-end gap-2">
          <PillButton size="sm" variant="outline" onClick={onClose}>Cancel</PillButton>
          {error && <PillButton size="sm" onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry</PillButton>}
        </div>
      </div>
    </div>
  );
}
