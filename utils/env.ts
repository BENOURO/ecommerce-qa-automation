import dotenv from 'dotenv';

// Loads variables from .env into process.env (does nothing if the file is absent,
// e.g. in CI where variables are provided by the workflow instead).
dotenv.config();

/**
 * Reads a required environment variable and fails fast with a clear message.
 * Failing early beats a confusing "undefined" error deep inside a test.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

/** Reads an optional variable, falling back to a default. */
function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** Single, typed entry point for configuration. Import `env` instead of touching process.env. */
export const env = {
  baseUrl: optional('BASE_URL', 'http://localhost:3000'),
  appPort: Number(optional('APP_PORT', '3000')),
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: Number(optional('DB_PORT', '5433')),
    name: optional('DB_NAME', 'shop_test'),
    user: optional('DB_USER', 'shop_user'),
    // Required: there is deliberately no default password in code.
    get password(): string {
      return required('DB_PASSWORD');
    },
  },
  sessionTtlSeconds: Number(optional('SESSION_TTL_SECONDS', '1800')),
  // Exposes POST /api/test/expire-session. Must stay false outside of test runs.
  enableTestEndpoints: optional('ENABLE_TEST_ENDPOINTS', 'false') === 'true',
  // Comma-separated names of seeded defects to switch on (see app/bugs.ts). Empty means a healthy app.
  bugs: optional('BUGS', ''),
  logRequests: optional('LOG_REQUESTS', 'false') === 'true', // prints one line per HTTP request
  adminEmail: optional('ADMIN_EMAIL', 'admin@example.test'),
  testUser: {
    get email(): string {
      return required('TEST_USER_EMAIL');
    },
    get password(): string {
      return required('TEST_USER_PASSWORD');
    },
  },
} as const;
