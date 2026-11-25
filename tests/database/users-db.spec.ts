import { test, expect } from '../../fixtures/test-fixtures';
import { findUserByEmail, findUserById } from '../../database/queries';
import { query } from '../../database/connection';
import { rollbackOnly } from '../../database/transaction';
import { seedUsers } from '../../database/seed-data';
import { addToCart, placeOrder } from '../../utils/api-helpers';
import { env } from '../../utils/env';
import { buildNewUser } from '../../utils/test-data';

test.describe('Users table', () => {
  test('DB-USR-001: a registered user is stored with the submitted details and the id the API returned', async ({
    testUser,
  }) => {
    const row = await findUserByEmail(testUser.email);

    expect(row).toMatchObject({
      id: testUser.id,
      email: testUser.email,
      full_name: testUser.fullName,
      role: 'customer', // new accounts are never administrators
    });
    // Compared inside the database, so a clock difference between this machine and the container cannot matter.
    const [recent] = await query<{ recent: boolean }>(
      `SELECT now() - created_at < interval '1 minute' AS recent FROM users WHERE id = $1`,
      [testUser.id],
    );
    expect(recent!.recent).toBe(true);
  });

  test('DB-USR-002: the password is stored as a bcrypt hash and only the right password verifies', async ({
    testUser,
  }) => {
    const row = await findUserById(testUser.id);

    expect(row!.password_hash).not.toContain(testUser.password);
    expect(row!.password_hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/); // bcrypt: 60 characters
    const check = (password: string) =>
      query<{ ok: boolean }>('SELECT password_hash = crypt($1, password_hash) AS ok FROM users WHERE id = $2', [
        password,
        testUser.id,
      ]);
    expect((await check(testUser.password))[0]!.ok).toBe(true);
    expect((await check(testUser.password + 'x'))[0]!.ok).toBe(false);
  });

  test('DB-USR-003: two users with the same password get different hashes (salted)', async ({
    request,
    testUser,
    trackUser,
  }) => {
    const second = buildNewUser({ password: testUser.password });
    trackUser(second.email);
    expect((await request.post('/api/auth/register', { data: second })).status()).toBe(201);

    const first = await findUserById(testUser.id);
    const other = await findUserByEmail(second.email);

    expect(other!.password_hash).not.toBe(first!.password_hash);
  });

  test('DB-USR-004: emails are stored in lowercase, whatever case was typed', async ({ request, trackUser }) => {
    const data = buildNewUser();
    data.email = data.email.replace('qa.', 'QA.').replace('@example.test', '@Example.TEST');
    trackUser(data.email);
    expect((await request.post('/api/auth/register', { data })).status()).toBe(201);

    const row = await findUserByEmail(data.email.toLowerCase());
    const [mixedCase] = await query<{ count: number }>('SELECT count(*)::int AS count FROM users WHERE email <> lower(email)');

    expect(row).toBeDefined();
    expect(mixedCase!.count).toBe(0); // no user anywhere has an upper-case email
  });

  test('DB-USR-005: the seeded customer and administrator exist with the right roles', async () => {
    const customer = await findUserByEmail(env.testUser.email);
    const admin = await findUserByEmail(env.adminEmail);

    expect(customer).toMatchObject({ full_name: seedUsers.customerName, role: 'customer' });
    expect(admin).toMatchObject({ full_name: seedUsers.adminName, role: 'admin' });
  });

  test('DB-USR-006: a duplicate registration is refused and leaves exactly one row', async ({
    request,
    testUser,
  }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: testUser.email, password: 'another-password-1', fullName: 'Impostor' },
    });

    const [count] = await query<{ count: number }>('SELECT count(*)::int AS count FROM users WHERE email = $1', [
      testUser.email,
    ]);
    expect(response.status()).toBe(409);
    expect(count!.count).toBe(1);
    expect((await findUserByEmail(testUser.email))!.full_name).toBe(testUser.fullName); // not overwritten
  });

  test('DB-USR-007: an invalid registration saves nothing', async ({ request }) => {
    const data = buildNewUser({ password: 'short' });

    const response = await request.post('/api/auth/register', { data });

    expect(response.status()).toBe(400);
    expect(await findUserByEmail(data.email)).toBeUndefined();
  });

  test('DB-USR-008: quotes and SQL in a name are stored literally and harm nothing', async ({
    request,
    trackUser,
  }) => {
    const data = buildNewUser({ fullName: `Robert'); DROP TABLE users;-- ` });
    trackUser(data.email);

    expect((await request.post('/api/auth/register', { data })).status()).toBe(201);

    const row = await findUserByEmail(data.email);
    const [users] = await query<{ count: number }>('SELECT count(*)::int AS count FROM users');
    expect(row!.full_name).toBe(data.fullName.trim()); // stored exactly as typed (surrounding spaces trimmed)
    expect(users!.count).toBeGreaterThanOrEqual(2); // the table still exists
  });
});

test.describe('Users table: rules enforced by the database itself', () => {
  const insertUser = `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)`;

  test('DB-USR-010: two users cannot share an email (unique violation 23505)', async ({ testUser }) => {
    await rollbackOnly(async (client) => {
      await expect(client.query(insertUser, [testUser.email, 'hash', 'Copy', 'customer'])).rejects.toMatchObject({
        code: '23505',
        constraint: 'users_email_key',
      });
    });
  });

  test('DB-USR-011: only "customer" and "admin" are valid roles (check violation 23514)', async () => {
    await rollbackOnly(async (client) => {
      await expect(client.query(insertUser, ['role.test@example.test', 'hash', 'Role Test', 'superuser'])).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  for (const [column, values] of [
    ['email', [null, 'hash', 'Name', 'customer']],
    ['password_hash', ['null.hash@example.test', null, 'Name', 'customer']],
    ['full_name', ['null.name@example.test', 'hash', null, 'customer']],
  ] as const) {
    test(`DB-USR-012: ${column} cannot be empty (not-null violation 23502)`, async () => {
      await rollbackOnly(async (client) => {
        await expect(client.query(insertUser, [...values])).rejects.toMatchObject({ code: '23502', column });
      });
    });
  }

  test('DB-USR-013: a user who has orders cannot be deleted (foreign key violation 23503)', async ({
    authenticatedRequest,
    testUser,
  }) => {
    await addToCart(authenticatedRequest, 'ELEC-001', 1);
    await placeOrder(authenticatedRequest);

    await rollbackOnly(async (client) => {
      await expect(client.query('DELETE FROM users WHERE id = $1', [testUser.id])).rejects.toMatchObject({
        code: '23503',
      });
    });
    expect(await findUserById(testUser.id)).toBeDefined(); // still there
  });
});
