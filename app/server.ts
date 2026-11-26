import express, { type NextFunction, type Request, type Response } from 'express';
import { resolve } from 'node:path';
import { closePool, query } from '../database/connection';
import { env } from '../utils/env';
import { enabledBugs, hasBug } from './bugs';
import { HttpError } from './http';
import { authRouter } from './routes/auth';
import { cartRouter } from './routes/cart';
import { ordersRouter } from './routes/orders';
import { productsRouter } from './routes/products';
import { expireSession, requireAdmin, requireAuth, requirePageAuth, sessionMiddleware } from './sessions';

const app = express();
const view = (name: string) => resolve('app', 'views', `${name}.html`);

if (env.logRequests) {
  // Diagnostics: report when the Node event loop was blocked or starved for more than half a second.
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - last > 600) console.log(`EVENT LOOP STALL: ${now - last - 100}ms at ${new Date().toISOString()}`);
    last = now;
  }, 100).unref();
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
    next();
  });
}

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(resolve('app', 'public'))); // css and browser scripts only

// ---- JSON API ----
// Readiness check: "ok" only when the database answers too. Playwright waits for this before
// starting the tests, so the first test never pays for a cold database connection.
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  // SEEDED DEFECT when the bug is on: password hashes are included in the response.
  const hashColumn = hasBug('leak-password-hash') ? `, password_hash AS "passwordHash"` : '';
  const users = await query(`SELECT id, email, full_name AS "fullName", role${hashColumn} FROM users ORDER BY id`);
  res.status(200).json({ users });
});

if (env.enableTestEndpoints) {
  // Test-only hook so tests can simulate session expiry without waiting for the TTL.
  app.post('/api/test/expire-session', requireAuth, (req, res) => {
    expireSession(req.sessionId!);
    res.status(204).end();
  });
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---- HTML pages ----
app.get('/', (_req, res) => res.redirect('/products'));
app.get('/login', (_req, res) => res.sendFile(view('login')));
app.get('/products', (_req, res) => res.sendFile(view('products')));
app.get('/products/:id', (_req, res) => res.sendFile(view('product')));
app.get('/cart', requirePageAuth, (_req, res) => res.sendFile(view('cart')));
app.get('/checkout', requirePageAuth, (_req, res) => res.sendFile(view('checkout')));
app.get('/orders/:id/confirmation', requirePageAuth, (_req, res) => res.sendFile(view('confirmation')));

// ---- Error handling: always JSON, never a stack trace ----
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(400).json({ error: 'Invalid request body' }); // e.g. malformed JSON
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.appPort, () => {
  console.log(`Shop app listening on http://localhost:${env.appPort}`);
  if (enabledBugs().length > 0) {
    console.warn(`WARNING: seeded defects are ON: ${enabledBugs().join(', ')}. This is for demonstration only.`);
  }
});

async function shutdown(): Promise<void> {
  server.close();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

