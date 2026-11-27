'use client';

import { useEffect, useState } from 'react';

export function ConnectionStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div className="flex items-center gap-2" role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${online === true ? 'bg-emerald-500' : online === false ? 'bg-rose-600' : 'bg-slate-400'}`} />
      <span className="font-medium text-slate-300">{online === true ? 'Network online' : online === false ? 'Offline' : 'Checking connection…'}</span>
    </div>
  );
}
