import { getPool, query } from './connection';

/** Row shapes use the database's snake_case column names, exactly as stored. */
export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  created_at: Date;
}

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  stock_quantity: number;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
}

export async function findProductBySku(sku: string): Promise<ProductRow | undefined> {
  const rows = await query<ProductRow>('SELECT * FROM products WHERE sku = $1', [sku]);
  return rows[0];
}

export interface OrderRow {
  id: number;
  user_id: number;
  status: string;
  total_cents: number;
  shipping_name: string;
  shipping_email: string;
  shipping_address: string;
  shipping_city: string;
  shipping_postal_code: string;
  created_at: Date;
}

export async function countOrdersForUser(userId: number): Promise<number> {
  const rows = await query<{ count: string }>('SELECT count(*) AS count FROM orders WHERE user_id = $1', [userId]);
  return Number(rows[0]?.count ?? 0);
}

export async function listOrdersForUser(userId: number): Promise<OrderRow[]> {
  return query<OrderRow>('SELECT * FROM orders WHERE user_id = $1 ORDER BY id', [userId]);
}

export async function countProducts(): Promise<number> {
  const rows = await query<{ count: string }>('SELECT count(*) AS count FROM products');
  return Number(rows[0]?.count ?? 0);
}

/**
 * Test cleanup: removes a test user and everything they created, and gives the stock
 * of ordered products back so seed data stays exact between tests.
 * One transaction: either all of it happens or none of it.
 */
export async function deleteUserAndOrders(userId: number): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE products p
          SET stock_quantity = p.stock_quantity + s.qty
         FROM (SELECT oi.product_id, SUM(oi.quantity)::int AS qty
                 FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                WHERE o.user_id = $1
                GROUP BY oi.product_id) s
        WHERE p.id = s.product_id`,
      [userId],
    );
    await client.query('DELETE FROM orders WHERE user_id = $1', [userId]); // order_items go too (ON DELETE CASCADE)
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
