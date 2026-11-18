'use client';

import { useCallback, useEffect, useState } from 'react';
import { PassEntity } from '@/core/domain/entities/pass.entity';

export function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value.trim()), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function usePassCollection(endpoint: string, query: string) {
  const [passes, setPasses] = useState<PassEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [pagination, setPagination] = useState({ query, page: 0 });
  const page = pagination.query === query ? pagination.page : 0;
  const pageSize = 25;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const setPage = (nextPage: number) => setPagination({ query, page: Math.max(0, nextPage) });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams(query);
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      try {
        const response = await fetch(`${endpoint}?${params}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load records. Check the connection and try again.');
        const data = await response.json();
        if (controller.signal.aborted) return;
        const count = Number(data.total) || 0;
        if (page > 0 && page * pageSize >= count) {
          setPagination({ query, page: Math.max(0, Math.ceil(count / pageSize) - 1) });
          return;
        }
        setPasses(data.passes || []);
        setTotal(count);
      } catch (err) {
        if (controller.signal.aborted) return;
        setPasses([]);
        setTotal(0);
        setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [endpoint, query, page, revision]);

  return { passes, total, loading, error, page, pageSize, setPage, refresh };
}
