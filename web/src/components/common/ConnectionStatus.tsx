'use client';

import { useEffect, useState } from 'react';

export function ConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');

  useEffect(() => {
    let controller: AbortController;
    const check = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const response = await fetch('/api/stats', { cache: 'no-store', signal });
        if (!signal.aborted) setStatus(response.ok ? 'connected' : 'unavailable');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setStatus('unavailable');
      }
    };
    void check();
    const interval = window.setInterval(check, 60000);
    return () => { controller?.abort(); window.clearInterval(interval); };
  }, []);

  return (
    <div className="flex items-center gap-2" role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'unavailable' ? 'bg-rose-600' : 'bg-slate-400'}`} />
      <span className="font-medium text-slate-300">{status === 'connected' ? 'Database connected' : status === 'unavailable' ? 'Database unavailable' : 'Checking connection…'}</span>
    </div>
  );
}
