'use client';

import { useEffect, useState } from 'react';
import type { MasterStation } from '@/core/domain/police-stations';

// Loaded once per page and shared by every screen that offers a police station pick list.
let cached: Promise<MasterStation[]> | null = null;

function loadStations(): Promise<MasterStation[]> {
  cached ??= fetch('/api/police-force/stations', { cache: 'no-store' })
    .then(response => (response.ok ? response.json() : { stations: [] }))
    .then(data => (data.stations as MasterStation[]).filter(item => item.active !== false))
    .catch(() => { cached = null; return []; });
  return cached;
}

/** Active police stations from the master list (empty until loaded, or if it cannot be loaded). */
export function usePoliceStations(): MasterStation[] {
  const [stations, setStations] = useState<MasterStation[]>([]);
  useEffect(() => {
    let alive = true;
    void loadStations().then(list => { if (alive) setStations(list); });
    return () => { alive = false; };
  }, []);
  return stations;
}
