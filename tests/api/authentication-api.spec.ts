import { test, expect } from '../../fixtures/test-fixtures';
import { env } from '../../utils/env';
import { buildNewUser } from '../../utils/test-data';

interface UserBody {
  user: { id: number; email: string; fullName: string; role: string };
}

test.describe('Authentication API: registration', () => {
  test('AUTH-API-001: registering returns 201 with the new user and no password data', async ({
    request,
    trackUser,
  }) => {
    const data = buildNewUser({ email: `Mixed.Case.${Date.now()}@Example.Test` });
    trackUser(data.email);

    const response = await request.post('/api/auth/register', { data });

    expect(response.status()).toBe(201);
    const body = (await response.json()) as UserBody;
    expect(body.user).toEqual({
      id: expect.any(Number),
      email: data.email.toLowerCase(), // emails are stored in lowercase
      fullName: data.fullName,
      role: 'customer',
    });
    expect(JSON.stringify(body)).not.toContain(data.password);
    expect(JSON.stringify(body)).not.toContain('password');
  });

  const invalidRegistrations = [
    { name: 'invalid email', patch: { email: 'not-an-email' }, field: 'email' },
    { name: 'password shorter than 8 characters', patch: { password: 'short' }, field: 'password' },
    { name: 'empty full name', patch: { fullName: '   ' }, field: 'fullName' },
  ];
  for (const { name, patch, field } of invalidRegistrations) {
    test(`AUTH-API-002: registration with ${name} returns 400 naming the field`, async ({ request, trackUser }) => {
      const data = { ...buildNewUser(), ...patch };
      trackUser(data.email);

      const response = await request.post('/api/auth/register', { data });

      expect(response.status()).toBe(400);
      const body = (await response.json()) as { error: string; details: Record<string, string> };
      expect(body.error).toBe('Validation failed');
      expect(Object.keys(body.details)).toEqual([field]);
    });
  }

  test('AUTH-API-003: registering an email that already exists returns 409', async ({ request, testUser }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: testUser.email.toUpperCase(), password: 'another-valid-password', fullName: 'Someone Else' },
    });

    expect(response.status()).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe('An account with this email already exists');
  });
});

test.describe('Authentication API: login', () => {
  test('AUTH-API-010: valid login returns 200, the user, and an HttpOnly session cookie', async ({
    request,
    testUser,
  }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as UserBody;
    expect(body.user).toMatchObject({ id: testUser.id, email: testUser.email, role: 'customer' });
    const cookie = response.headers()['set-cookie'] ?? '';
    expect(cookie).toContain('sid=');
    expect(cookie).toContain('HttpOnly'); // JavaScript in the page cannot read the session id
    expect(cookie).toContain('SameSite=Lax');
  });

  test('AUTH-API-011: login email is case-insensitive', async ({ request, testUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: testUser.email.toUpperCase(), password: testUser.password },
    });

    expect(response.status()).toBe(200);
  });

  test('AUTH-API-012: unknown email and wrong password give the same 401 response', async ({
    request,
    testUser,
  }) => {
    const unknownEmail = await request.post('/api/auth/login', {
      data: { email: 'nobody.here@example.test', password: testUser.password },
    });
    const wrongPassword = await request.post('/api/auth/login', {
      data: { email: testUser.email, password: 'wrong-password-123' },
    });

    expect(unknownEmail.status()).toBe(401);
    expect(wrongPassword.status()).toBe(401);
    // Identical bodies: an attacker cannot tell which emails have accounts.
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
    expect(unknownEmail.headers()['set-cookie']).toBeUndefined();
  });

  const incompleteLogins: Array<[string, Record<string, unknown>]> = [
    ['an empty body', {}],
    ['a missing password', { email: 'someone@example.test' }],
    ['a missing email', { password: 'whatever-password' }],
    ['blank values', { email: '  ', password: '  ' }],
    ['non-string values', { email: 123, password: ['x'] }],
  ];
  for (const [name, data] of incompleteLogins) {
    test(`AUTH-API-013: login with ${name} returns 400`, async ({ request }) => {
      const response = await request.post('/api/auth/login', { data });

      expect(response.status()).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('Email and password are required');
    });
  }

  test('AUTH-API-014: malformed JSON returns a clean 400 and no stack trace', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: '{ this is not json',
    });

    expect(response.status()).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'Invalid request body' });
    expect(text).not.toMatch(/at .*\.(js|ts)/); // no stack trace leaked
  });

  test("AUTH-API-015: a SQL injection attempt in the email is treated as a normal failed login", async ({
    request,
  }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: "' OR '1'='1' --", password: "' OR '1'='1" },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Authentication API: sessions', () => {
  test('AUTH-API-020: /me without a session returns 401', async ({ request }) => {
    const response = await request.get('/api/auth/me');

    expect(response.status()).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe('Authentication required');
  });

  test('AUTH-API-021: /me with a valid session returns the logged-in user', async ({ request, testUser }) => {
    await request.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });

    const response = await request.get('/api/auth/me');

    expect(response.status()).toBe(200);
    expect(((await response.json()) as UserBody).user.email).toBe(testUser.email);
  });

  test('AUTH-API-022: logout returns 204 and ends the session', async ({ request, testUser }) => {
    await request.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });

    const logout = await request.post('/api/auth/logout');
    const afterLogout = await request.get('/api/auth/me');

    expect(logout.status()).toBe(204);
    expect(afterLogout.status()).toBe(401);
  });

  test('AUTH-API-023: a session id is invalid on the server after logout, not just removed from the browser', async ({
    request,
    testUser,
  }) => {
    await request.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });
    const { cookies } = await request.storageState();
    const sid = cookies.find((c) => c.name === 'sid')?.value;
    expect(sid, 'a session cookie should have been issued').toBeTruthy();
    await request.post('/api/auth/logout');

    // Replay the old session id by hand, as an attacker who stole it would.
    const replay = await request.get('/api/auth/me', { headers: { Cookie: `sid=${sid}` } });

    expect(replay.status()).toBe(401);
  });

  test('AUTH-API-024: an expired session is rejected with 401', async ({ request, testUser }) => {
    await request.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });
    const expire = await request.post('/api/test/expire-session');
    expect(expire.status()).toBe(204);

    const response = await request.get('/api/auth/me');

    expect(response.status()).toBe(401);
  });

  test('AUTH-API-025: a made-up session id is rejected', async ({ request }) => {
    const response = await request.get('/api/auth/me', { headers: { Cookie: 'sid=00000000-0000-0000-0000-000000000000' } });

    expect(response.status()).toBe(401);
  });
});

test.describe('Authentication API: authorization', () => {
  test('AUTH-API-030: the admin endpoint rejects anonymous callers with 401', async ({ request }) => {
    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(401);
  });

  test('AUTH-API-031: the admin endpoint rejects a normal customer with 403', async ({ request, testUser }) => {
    await request.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });

    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe('Admin access required');
  });

  test('AUTH-API-032: an admin can list users, and the list never exposes password hashes', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { email: env.adminEmail, password: env.testUser.password },
    });
    expect(login.status(), 'seeded admin should be able to log in').toBe(200);

    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { users: Array<{ email: string; role: string }> };
    expect(body.users.some((u) => u.email === env.adminEmail && u.role === 'admin')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/password|\$2[aby]\$/);
  });
});
