import { Router } from 'express';
import { query } from '../../database/connection';
import { hasBug } from '../bugs';
import { HttpError, bodyOf, isEmail, isNonEmptyString } from '../http';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  requireAuth,
  type SessionUser,
} from '../sessions';
import { env } from '../../utils/env';

export const authRouter = Router();

const USER_COLUMNS = `id, email, full_name AS "fullName", role`;

authRouter.post('/register', async (req, res) => {
  const body = bodyOf(req.body);
  const details: Record<string, string> = {};
  if (!isEmail(body.email)) details.email = 'A valid email is required';
  const minPasswordLength = hasBug('weak-password-allowed') ? 1 : 8; // SEEDED DEFECT when the bug is on
  if (typeof body.password !== 'string' || body.password.length < minPasswordLength) {
    details.password = 'Password must be at least 8 characters';
  }
  if (!isNonEmptyString(body.fullName, 100)) details.fullName = 'Full name is required';
  if (Object.keys(details).length > 0) throw new HttpError(400, 'Validation failed', details);

  try {
    const rows = await query<SessionUser>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, crypt($2, gen_salt('bf')), $3)
       RETURNING ${USER_COLUMNS}`,
      [String(body.email).trim().toLowerCase(), body.password, String(body.fullName).trim()],
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw error;
  }
});

authRouter.post('/login', async (req, res) => {
  const body = bodyOf(req.body);
  if (!isNonEmptyString(body.email) || !isNonEmptyString(body.password)) {
    throw new HttpError(400, 'Email and password are required');
  }
  const rows = await query<SessionUser>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE email = $1 AND password_hash = crypt($2, password_hash)`,
    [body.email.trim().toLowerCase(), body.password],
  );
  const user = rows[0];
  // Same message for unknown email and wrong password: do not reveal which accounts exist.
  if (!user) {
    if (hasBug('user-enumeration')) {
      // SEEDED DEFECT: different messages tell an attacker which emails have accounts.
      const known = await query('SELECT 1 FROM users WHERE email = $1', [body.email.trim().toLowerCase()]);
      throw new HttpError(401, known.length > 0 ? 'Wrong password' : 'No account found with this email');
    }
    throw new HttpError(401, 'Invalid email or password');
  }

  const sessionId = createSession(user);
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: env.sessionTtlSeconds * 1000,
  });
  res.status(200).json({ user });
});

authRouter.post('/logout', (req, res) => {
  if (req.sessionId) destroySession(req.sessionId);
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});
