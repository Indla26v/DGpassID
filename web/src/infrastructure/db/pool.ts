import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

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
    const connectionString = resolveDatabaseUrl();
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    poolInstance = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
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
