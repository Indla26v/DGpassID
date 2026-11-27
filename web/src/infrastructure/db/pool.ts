import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';

// Keep DATE columns (e.g. date_of_birth) as YYYY-MM-DD text instead of local-midnight Date objects.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

let poolInstance: Pool | null = null;

export function resolveDatabaseUrl(): string {
  const envPooled = process.env.DATABASE_URL_POOLED?.trim();
  if (envPooled) return envPooled;

  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;

  throw new Error('Configure DATABASE_URL_POOLED or DATABASE_URL for the pass database.');
}

export function getDatabasePool(): Pool {
  if (!poolInstance) {
    const url = new URL(resolveDatabaseUrl());
    // pg honors the last host query parameter ahead of the URL hostname.
    const hostname = url.searchParams.getAll('host').at(-1) || url.hostname;
    const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());
    if (!isLoopback) {
      // URL options override Pool's ssl option. Enforce verification there too.
      url.searchParams.delete('ssl');
      url.searchParams.delete('uselibpqcompat');
      url.searchParams.set('sslmode', 'verify-full');
    }

    poolInstance = new Pool({
      connectionString: url.href,
      ssl: isLoopback ? false : { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  return poolInstance;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client?: PoolClient
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(text, params);
  }
  const pool = getDatabasePool();
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
