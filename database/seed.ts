import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { closePool, getPool, query } from './connection';
import { seedProducts, seedUsers } from './seed-data';
import { env } from '../utils/env';

/**
 * Recreates the schema and loads seed data.
 * Run from the project root:  npm run db:reset
 */
async function main(): Promise<void> {
  // Safety guard: this script DROPS tables, so it only runs against a database named *_test.
  if (!env.db.name.endsWith('_test')) {
    throw new Error(
      `Refusing to reset database "${env.db.name}": its name must end with "_test".`,
    );
  }

  const schemaSql = readFileSync(resolve('database', 'schema.sql'), 'utf8');
  await getPool().query(schemaSql); // schema.sql has no parameters, so one multi-statement call is fine

  // crypt($1, gen_salt('bf')) hashes the password inside PostgreSQL (bcrypt).
  // The plain password is passed as a parameter and is never stored.
  const insertUser = `
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES ($1, crypt($2, gen_salt('bf')), $3, $4)`;
  await query(insertUser, [env.testUser.email, env.testUser.password, seedUsers.customerName, 'customer']);
  await query(insertUser, [env.adminEmail, env.testUser.password, seedUsers.adminName, 'admin']);

  const insertProduct = `
    INSERT INTO products (sku, name, description, category, price_cents, stock_quantity)
    VALUES ($1, $2, $3, $4, $5, $6)`;
  for (const p of seedProducts) {
    await query(insertProduct, [p.sku, p.name, p.description, p.category, p.priceCents, p.stockQuantity]);
  }

  const [counts] = await query<{ users: string; products: string }>(
    `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM products) AS products`,
  );
  console.log(`Database "${env.db.name}" reset: ${counts?.users} users, ${counts?.products} products.`);
}

main()
  .catch((error: unknown) => {
    console.error('Database reset failed:', error);
    process.exitCode = 1;
  })
  .finally(closePool);
