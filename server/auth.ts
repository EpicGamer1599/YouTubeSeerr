import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { one, run } from './db.js';
import { decrypt, encrypt, settings } from './config.js';
import { jellyfin, HttpError } from './jellyfin.js';
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export function userDto(u: any) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    isAdmin: !!(u.jellyfin_admin || u.local_admin),
    jellyfinAdmin: !!u.jellyfin_admin,
    localAdmin: !!u.local_admin,
    disabled: !!u.disabled,
    avatar: u.avatar_tag ? '/api/auth/avatar' : null,
  };
}
export function upsertUser(u: any) {
  run(
    'INSERT INTO users(id,username,display_name,jellyfin_admin,avatar_tag,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,jellyfin_admin=excluded.jellyfin_admin,avatar_tag=excluded.avatar_tag',
    u.Id,
    u.Name,
    u.Name,
    +!!u.Policy?.IsAdministrator,
    u.PrimaryImageTag || null,
    Date.now(),
  );
  return one('SELECT * FROM users WHERE id=?', u.Id);
}
export function createSession(res: Response, u: any, token: string) {
  if (u.disabled) throw new HttpError(403, 'Your YouTubeSeerr access is disabled.');
  const id = randomBytes(32).toString('hex'),
    csrf = randomBytes(32).toString('hex'),
    now = Date.now();
  const maxAge = settings().sessionHours * 3600000;
  run(
    'INSERT INTO sessions VALUES(?,?,?,?,?,?)',
    hash(id),
    u.id,
    csrf,
    encrypt(token),
    now + maxAge,
    now,
  );
  res.cookie('ys_session', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge,
  });
  return { user: userDto(u), csrf };
}
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const allowed = process.env.APP_ORIGIN;
  if (origin && (allowed ? origin !== allowed : new URL(origin).host !== req.get('host')))
    throw new HttpError(403, 'This request came from an untrusted origin.');
  if (!req.is('application/json')) throw new HttpError(415, 'Send application/json.');
  if (req.get('sec-fetch-site') === 'cross-site')
    throw new HttpError(403, 'Cross-site requests are not allowed.');
  next();
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = req.cookies?.ys_session;
  const session =
    typeof id === 'string'
      ? one('SELECT * FROM sessions WHERE id=? AND expires_at>?', hash(id), Date.now())
      : undefined;
  if (!session) throw new HttpError(401, 'Please sign in with your Jellyfin account.');
  let u = one('SELECT * FROM users WHERE id=?', session.user_id);
  if (!u || u.disabled) throw new HttpError(403, 'Your YouTubeSeerr access is disabled.');
  if (session.checked_at < Date.now() - 300000) {
    try {
      const remote = await jellyfin('/Users/Me', { token: decrypt(session.token) });
      if (remote.Id !== u.id || remote.Policy?.IsDisabled)
        throw new HttpError(401, 'Your Jellyfin session is no longer active.');
      u = upsertUser(remote);
      run('UPDATE sessions SET checked_at=? WHERE id=?', Date.now(), session.id);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401)
        run('DELETE FROM sessions WHERE id=?', session.id);
      throw e;
    }
  }
  res.locals.user = u;
  res.locals.session = session;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const value = req.get('x-csrf-token') || '';
    const a = Buffer.from(value),
      b = Buffer.from(session.csrf);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new HttpError(403, 'Invalid security token. Reload the page and try again.');
  }
  next();
}
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user?.jellyfin_admin && !res.locals.user?.local_admin)
    throw new HttpError(403, 'Administrator permission is required.');
  next();
}
