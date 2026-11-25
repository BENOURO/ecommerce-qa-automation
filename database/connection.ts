import { Pool, type QueryResultRow } from 'pg';
import { env } from '../utils/env';

/**
 * One shared connection pool per process.
 * A pool reuses a few open connections instead of opening a new one for every query.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
      user: env.db.user,
      password: env.db.password,
      max: 5,
    });
  }
  return pool;
}

/**
 * Runs a PARAMETERIZED query: values go in `params` and are referenced as $1, $2, ...
 * They are sent separately from the SQL text, so input can never change the query's
 * structure (this is what prevents SQL injection). Never build SQL with string concatenation.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

/** Closes all connections. Call at the end of scripts/test runs so the process can exit. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
