import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../utils/env';

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  role: 'customer' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

interface Session {
  user: SessionUser;
  expiresAt: number;
}

export const SESSION_COOKIE = 'sid';

/** In-memory session store (sessions are lost when the app restarts). */
const sessions = new Map<string, Session>();

const ttlMs = (): number => env.sessionTtlSeconds * 1000;

export function createSession(user: SessionUser): string {
  const id = randomUUID();
  sessions.set(id, { user, expiresAt: Date.now() + ttlMs() });
  return id;
}

export function destroySession(id: string): void {
  sessions.delete(id);
}

/** Test hook: marks a session as expired server-side without waiting for the TTL. */
export function expireSession(id: string): void {
  const session = sessions.get(id);
  if (session) session.expiresAt = 0;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/** Attaches req.user when the request carries a valid, unexpired session cookie (sliding expiry). */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const id = readCookie(req.headers.cookie, SESSION_COOKIE);
  const session = id ? sessions.get(id) : undefined;
  if (id && session) {
    if (session.expiresAt <= Date.now()) {
      sessions.delete(id);
    } else {
      session.expiresAt = Date.now() + ttlMs();
      req.user = session.user;
      req.sessionId = id;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/** For HTML pages: unauthenticated visitors are redirected to the login page. */
export function requirePageAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.redirect('/login');
    return;
  }
  next();
}
