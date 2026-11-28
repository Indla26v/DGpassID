'use client';

import { useCallback, useEffect, useState } from 'react';
import { setCustomDutyPoints, type DutyPoint } from '@/core/domain/police-zones';

/**
 * Loads the duty points added in the app and makes dutyPointsFor / findDutyPoint include them.
 * `version` changes after each load so screens re-read their point lists; `reload` fetches again.
 */
export function useCustomDutyPoints() {
  const [version, setVersion] = useState(0);
  const [points, setPoints] = useState<DutyPoint[]>([]);
  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/deployment/points', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setCustomDutyPoints(data.points);
      setPoints(data.points);
      setVersion(value => value + 1);
    } catch { /* the scheme's points still work */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { version, points, reload };
}
