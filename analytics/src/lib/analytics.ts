import 'server-only';
import { Pool } from 'pg';
import { unstable_cache } from 'next/cache';
import type { Analytics } from './types';
const globalDb = globalThis as unknown as { analyticsPool?: Pool };
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('Database configuration is missing');
  if (!globalDb.analyticsPool) {
    const url = new URL(process.env.DATABASE_URL);
    if (process.env.NODE_ENV === 'production' && url.username !== 'dgp_analytics_reader') throw new Error('Analytics must use the restricted reporting login');
    const localDevelopment = process.env.NODE_ENV === 'development' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    url.searchParams.set('sslmode', localDevelopment ? 'disable' : 'verify-full');
    globalDb.analyticsPool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 6000, application_name: 'DGP aggregate-only analytics' });
    globalDb.analyticsPool.on('error', () => console.error('Analytics database connection interrupted'));
  }
  return globalDb.analyticsPool;
}
async function querySnapshot(days: number, institution: string): Promise<Analytics> {
  const { rows } = await getPool().query('SELECT pass_analytics.snapshot($1::int, $2::text) AS data', [days, institution]);
  return rows[0].data as Analytics;
}
const cachedSnapshot = unstable_cache(querySnapshot, ['analytics-aggregate-v3'], { revalidate: 30 });
const inFlight = new Map<string, Promise<Analytics>>();
export async function getAnalytics(days: number, institution: string): Promise<Analytics> {
  const key = `${days}:${institution}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = cachedSnapshot(days, institution).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}
