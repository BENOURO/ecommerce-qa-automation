import type { PoolClient } from 'pg';
import { getPool } from './connection';

/**
 * Runs `work` inside a database transaction that is ALWAYS rolled back.
 *
 * Use it for tests that deliberately break rules (insert a negative price, delete a row that is still
 * referenced...). Whatever happens inside, nothing is ever saved, so no other test can see it and
 * nothing needs cleaning up. Other connections never see uncommitted changes.
 *
 * Note: once a statement fails inside a PostgreSQL transaction, the rest of that transaction is
 * unusable, so each rule-breaking attempt gets its own call.
 */
export async function rollbackOnly<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    return await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
