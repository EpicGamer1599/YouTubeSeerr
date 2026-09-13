import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { all, one, run, transaction, log } from './db.js';
import {
  configured,
  settings,
  settingsSchema,
  saveSettings,
  setSecret,
  setValue,
  publicSettings,
  secret,
  decrypt,
  validServerUrl,
} from './config.js';
import {
  sameOrigin,
  requireAuth,
  requireAdmin,
  createSession,
  upsertUser,
  userDto,
  hash,
} from './auth.js';
import { authenticate, jellyfin, refreshLibrary, HttpError } from './jellyfin.js';
import {
  search,
  details,
  collectionPage,
  resolveInput,
  youtube,
  type MediaType,
} from './youtube.js';
import {
  createRequest,
  approve,
  cancelRequest,
  requestList,
  mediaState,
  syncRequests,
  enqueue,
} from './requests.js';

export const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.COOKIE_SECURE === 'true' ? [] : null,
      },
    },
    strictTransportSecurity: process.env.COOKIE_SECURE === 'true' ? undefined : false,
  }),
);
app.use(express.json({ limit: '64kb' }), cookieParser(), sameOrigin);
const authLimiter = rateLimit({
  windowMs: 60000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in one minute.' },
});
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', (_req, res) => {
  one('SELECT 1');
  res.json({ status: 'ok' });
});
app.get('/api/setup', (_req, res) =>
  res.json({
    configured: configured(),
    connected: !!one('SELECT id FROM users LIMIT 1'),
    appName: settings().appName,
  }),
);
const credentials = z.object({
  username: z.string().min(1).max(200),
  password: z.string().max(1024),
});
app.post('/api/setup/test', authLimiter, async (req, res) => {
  if (configured() || one('SELECT id FROM users LIMIT 1'))
    throw new HttpError(409, 'Use authenticated Settings to test your server.');
  const url = validServerUrl(z.string().parse(req.body.url));
  const data = await jellyfin('/System/Info/Public', { url });
  if (!data?.Id) throw new HttpError(400, 'This address did not return a Jellyfin server.');
  res.json({ name: data.ServerName, version: data.Version });
});
app.post('/api/setup/connect', authLimiter, async (req, res) => {
  if (configured() || one('SELECT id FROM users LIMIT 1'))
    throw new HttpError(409, 'Jellyfin is already connected. Sign in to continue setup.');
  const b = credentials.extend({ url: z.string() }).parse(req.body),
    url = validServerUrl(b.url);
  const data = await authenticate(url, b.username, b.password);
  if (!data.User.Policy?.IsAdministrator)
    throw new HttpError(403, 'A Jellyfin administrator must complete setup.');
  const u = transaction(() => {
    if (one('SELECT id FROM users LIMIT 1'))
      throw new HttpError(409, 'Another administrator already connected Jellyfin.');
    setValue('jellyfinUrl', url);
    setSecret('jellyfinToken', data.AccessToken);
    return upsertUser(data.User);
  });
  res.json(createSession(res, u, data.AccessToken));
});
app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!one('SELECT id FROM users LIMIT 1'))
    throw new HttpError(409, 'Connect Jellyfin in the setup wizard first.');
  const b = credentials.parse(req.body);
  const data = await authenticate(settings().jellyfinUrl, b.username, b.password);
  if (!configured() && !data.User.Policy?.IsAdministrator)
    throw new HttpError(403, 'An administrator must finish setup first.');
  const u = upsertUser(data.User);
  if (req.cookies?.ys_session) run('DELETE FROM sessions WHERE id=?', hash(req.cookies.ys_session));
  res.json(createSession(res, u, data.AccessToken));
});
app.use('/api', requireAuth);
app.get('/api/auth/me', (_req, res) =>
  res.json({ user: userDto(res.locals.user), csrf: res.locals.session.csrf }),
);
app.post('/api/auth/logout', (_req, res) => {
  run('DELETE FROM sessions WHERE id=?', res.locals.session.id);
  res.clearCookie('ys_session', { path: '/' });
  res.json({ ok: true });
});
app.get('/api/auth/avatar', async (_req, res) => {
  const r = (await jellyfin(
    '/Users/' + res.locals.user.id + '/Images/Primary?maxWidth=96&maxHeight=96',
    { token: decrypt(res.locals.session.token), raw: true },
  )) as Response;
  const type = r.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp)$/.test(type))
    throw new HttpError(404, 'Profile image unavailable.');
  res.type(type).send(Buffer.from(await r.arrayBuffer()));
});
app.get('/api/settings', requireAdmin, (_req, res) => res.json(publicSettings()));
async function updateConfiguration(body: any, finish: boolean) {
  const value = settingsSchema.parse({ ...settings(), ...body });
  if (value.downloadDir === value.mediaDir)
    throw new HttpError(400, 'Download staging and Jellyfin media directories must be different.');
  for (const dir of [value.downloadDir, value.mediaDir]) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
    } catch {
      throw new HttpError(
        400,
        'A storage directory is not writable. Check the volume mapping and permissions.',
      );
    }
  }
  const youtubeKey = z.string().max(500).optional().parse(body.youtubeKey);
  const jellyfinToken = z.string().max(2000).optional().parse(body.jellyfinToken);
  if (youtubeKey)
    await youtube('videos', { part: 'id', chart: 'mostPopular', maxResults: '1' }, youtubeKey);
  if (finish && !youtubeKey && !secret('youtubeKey'))
    throw new HttpError(400, 'A YouTube Data API key is required.');
  if (value.jellyfinUrl !== settings().jellyfinUrl || jellyfinToken)
    await jellyfin('/Library/VirtualFolders', {
      url: value.jellyfinUrl,
      token: jellyfinToken || secret('jellyfinToken'),
    });
  saveSettings(value);
  if (youtubeKey) setSecret('youtubeKey', youtubeKey);
  if (jellyfinToken) setSecret('jellyfinToken', jellyfinToken);
  if (finish) setValue('configured', true);
}
app.put('/api/settings', requireAdmin, async (req, res) => {
  await updateConfiguration(req.body, false);
  log('info', 'Server settings updated by ' + res.locals.user.username);
  res.json(publicSettings());
});
app.post('/api/setup/finish', requireAdmin, async (req, res) => {
  if (configured()) throw new HttpError(409, 'Setup is already complete.');
  await updateConfiguration(req.body, true);
  res.json({ ok: true });
});
app.get('/api/jellyfin/libraries', requireAdmin, async (_req, res) => {
  const rows = await jellyfin('/Library/VirtualFolders', { token: secret('jellyfinToken') });
  res.json(rows.map((r: any) => ({ id: r.ItemId, name: r.Name, type: r.CollectionType })));
});
app.post('/api/jellyfin/test', requireAdmin, async (_req, res) => {
  const data = await jellyfin('/System/Info/Public');
  await jellyfin('/Library/VirtualFolders', { token: secret('jellyfinToken') });
  res.json({ name: data.ServerName, version: data.Version, connected: true });
});
app.post('/api/jellyfin/refresh', requireAdmin, (_req, res) => {
  enqueue('refresh', null, null);
  res.json({ ok: true, message: 'Library refresh queued.' });
});
const searchLimits = new Map<string, { at: number; count: number }>();
app.get('/api/search', async (req, res) => {
  const b = z
    .object({
      q: z.string().trim().min(1).max(200),
      type: z.enum(['all', 'video', 'channel', 'playlist']).default('all'),
      pageToken: z.string().max(300).default(''),
    })
    .parse(req.query);
  const id = res.locals.user.id,
    now = Date.now();
  let bucket = searchLimits.get(id);
  if (!bucket || bucket.at < now - 60000) {
    bucket = { at: now, count: 0 };
    searchLimits.set(id, bucket);
  }
  if (++bucket.count > settings().searchPerMinute)
    throw new HttpError(429, 'Search limit reached. Try again in one minute.');
  const result = /^[a-z][a-z0-9+.-]*:\/\//i.test(b.q)
    ? { items: [await resolveInput(b.q)], nextPageToken: null }
    : await search(b.q, b.type, b.pageToken);
  res.json({
    ...result,
    items: result.items.map((m: any) => ({ ...m, ...mediaState(m.id, res.locals.user) })),
  });
});
app.get('/api/media/:type/:id', async (req, res) => {
  const type = z.enum(['video', 'channel', 'playlist']).parse(req.params.type);
  const m = await details(type, String(req.params.id));
  let avatar = m.avatar;
  if (type === 'video' && m.channelId) {
    try {
      avatar = (await details('channel', m.channelId)).avatar;
    } catch {}
  }
  res.json({ ...m, avatar, ...mediaState(m.id, res.locals.user) });
});
app.get('/api/media/:type/:id/items', async (req, res) => {
  const type = z.enum(['channel', 'playlist']).parse(req.params.type);
  const result = await collectionPage(
    type,
    String(req.params.id),
    z
      .string()
      .max(300)
      .parse(req.query.pageToken || ''),
  );
  res.json({
    ...result,
    items: result.items.map((m) => ({ ...m, ...mediaState(m.id, res.locals.user) })),
  });
});
app.get('/api/requests', (req, res) =>
  res.json(
    requestList(
      res.locals.user,
      typeof req.query.status === 'string' ? req.query.status : undefined,
      typeof req.query.type === 'string' ? req.query.type : undefined,
    ),
  ),
);
app.post('/api/requests', async (req, res) => {
  const id = await createRequest(res.locals.user.id, req.body);
  res.status(201).json({ id });
});
app.post('/api/requests/:id/approve', requireAdmin, (req, res) => {
  approve(
    z.coerce.number().int().positive().parse(req.params.id),
    res.locals.user.id,
    req.body.confirmedAll === true,
    req.body,
  );
  res.json({ ok: true });
});
app.post('/api/requests/:id/reject', requireAdmin, (req, res) => {
  const reason = z
    .string()
    .max(500)
    .parse(req.body.reason || 'Rejected by administrator.');
  const result = run(
    "UPDATE requests SET status='REJECTED',approved_by=?,error=?,updated_at=? WHERE id=? AND status='PENDING'",
    res.locals.user.id,
    reason,
    Date.now(),
    z.coerce.number().int().positive().parse(req.params.id),
  );
  if (!result.changes) throw new HttpError(409, 'Only pending requests can be rejected.');
  res.json({ ok: true });
});
app.post('/api/requests/:id/cancel', (req, res) => {
  cancelRequest(z.coerce.number().int().positive().parse(req.params.id), res.locals.user);
  res.json({ ok: true });
});
app.post('/api/requests/:id/retry', requireAdmin, (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id),
    r = one('SELECT * FROM requests WHERE id=?', id);
  if (!r || r.status !== 'FAILED') throw new HttpError(409, 'Only failed requests can be retried.');
  transaction(() => {
    run(
      "UPDATE jobs SET status='QUEUED',error=NULL,attempts=0,available_at=0,updated_at=? WHERE request_id=? AND status IN ('FAILED','CANCELLED')",
      Date.now(),
      id,
    );
    for (const item of all('SELECT media_id FROM request_items WHERE request_id=?', id)) {
      const j = one(
        "SELECT * FROM jobs WHERE media_id=? AND kind='download' ORDER BY id DESC LIMIT 1",
        item.media_id,
      );
      if (j && ['FAILED', 'CANCELLED'].includes(j.status))
        run(
          "UPDATE jobs SET status='QUEUED',error=NULL,attempts=0,available_at=0,updated_at=? WHERE id=?",
          Date.now(),
          j.id,
        );
    }
  });
  syncRequests();
  res.json({ ok: true });
});
app.get('/api/downloads', (_req, res) => {
  const u = res.locals.user,
    admin = !!(u.jellyfin_admin || u.local_admin);
  const jobs = all(
    "SELECT j.id,j.kind,j.media_id,j.request_id,j.status,j.progress,j.speed,j.eta,j.error,j.attempts,j.created_at,j.updated_at,m.data FROM jobs j LEFT JOIN media m ON m.id=j.media_id WHERE (?=1 OR EXISTS(SELECT 1 FROM request_items i JOIN requests r ON r.id=i.request_id WHERE i.media_id=j.media_id AND r.user_id=? AND r.status!='CANCELLED') OR EXISTS(SELECT 1 FROM requests r WHERE r.id=j.request_id AND r.user_id=?)) ORDER BY CASE WHEN j.status IN ('DOWNLOADING','PROCESSING') THEN 0 WHEN j.status='QUEUED' THEN 1 ELSE 2 END,j.id DESC LIMIT 300",
    +admin,
    u.id,
    u.id,
  );
  const queue = all("SELECT id FROM jobs WHERE status='QUEUED' ORDER BY id").map((j) => j.id);
  res.json({
    jobs: jobs.map((j) => ({
      ...j,
      data: undefined,
      media: j.data ? JSON.parse(j.data) : null,
      position: j.status === 'QUEUED' ? queue.indexOf(j.id) + 1 : null,
    })),
    paused: settings().queuePaused,
    workerOnline:
      (one("SELECT updated_at FROM heartbeats WHERE name='worker'")?.updated_at || 0) >
      Date.now() - 30000,
  });
});
app.post('/api/jobs/:id/cancel', requireAdmin, (req, res) => {
  const result = run(
    "UPDATE jobs SET status='CANCELLED',updated_at=? WHERE id=? AND status IN ('QUEUED','DOWNLOADING','PROCESSING')",
    Date.now(),
    z.coerce.number().int().positive().parse(req.params.id),
  );
  if (!result.changes) throw new HttpError(409, 'This job is no longer active.');
  syncRequests();
  res.json({ ok: true });
});
app.post('/api/jobs/:id/retry', requireAdmin, (req, res) => {
  const j = one(
    'SELECT * FROM jobs WHERE id=?',
    z.coerce.number().int().positive().parse(req.params.id),
  );
  if (!j || !['FAILED', 'CANCELLED'].includes(j.status))
    throw new HttpError(409, 'Only failed or cancelled jobs can be retried.');
  if (
    j.request_id &&
    one("SELECT id FROM requests WHERE id=? AND status='CANCELLED'", j.request_id)
  )
    throw new HttpError(409, 'The parent request has been cancelled.');
  run(
    "UPDATE jobs SET status='QUEUED',error=NULL,attempts=0,available_at=0,updated_at=? WHERE id=?",
    Date.now(),
    j.id,
  );
  syncRequests();
  res.json({ ok: true });
});
app.delete('/api/jobs/:id', requireAdmin, (req, res) => {
  const j = one(
    'SELECT * FROM jobs WHERE id=?',
    z.coerce.number().int().positive().parse(req.params.id),
  );
  if (!j || !['AVAILABLE', 'CANCELLED'].includes(j.status))
    throw new HttpError(409, 'Only completed or cancelled jobs can be removed.');
  if (
    j.status === 'CANCELLED' &&
    ((j.request_id &&
      one(
        "SELECT id FROM requests WHERE id=? AND status NOT IN ('CANCELLED','REJECTED')",
        j.request_id,
      )) ||
      (j.media_id &&
        !one('SELECT media_id FROM downloads WHERE media_id=?', j.media_id) &&
        one(
          "SELECT i.request_id FROM request_items i JOIN requests r ON r.id=i.request_id WHERE i.media_id=? AND r.status NOT IN ('CANCELLED','REJECTED')",
          j.media_id,
        )))
  )
    throw new HttpError(409, 'Cancel dependent requests or retry this job before removing it.');
  run('DELETE FROM jobs WHERE id=?', j.id);
  res.json({ ok: true });
});
app.get('/api/users', requireAdmin, (_req, res) =>
  res.json(
    all('SELECT * FROM users ORDER BY username').map((u) => ({ ...userDto(u), avatar: null })),
  ),
);
app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const b = z.object({ localAdmin: z.boolean(), disabled: z.boolean() }).parse(req.body),
    id = String(req.params.id);
  if (id === res.locals.user.id)
    throw new HttpError(400, 'Another administrator must change your permissions.');
  const u = one('SELECT * FROM users WHERE id=?', id);
  if (!u) throw new HttpError(404, 'User not found.');
  run('UPDATE users SET local_admin=?,disabled=? WHERE id=?', +b.localAdmin, +b.disabled, id);
  run('DELETE FROM sessions WHERE user_id=?', id);
  res.json({ ok: true });
});
app.get('/api/logs', requireAdmin, (req, res) => {
  const after = z.coerce
    .number()
    .int()
    .min(0)
    .parse(req.query.after || 0);
  res.json(all('SELECT * FROM logs WHERE id>? ORDER BY id DESC LIMIT 300', after));
});
app.use('/api', () => {
  throw new HttpError(404, 'API endpoint not found.');
});
const clientDir = resolve('dist/client');
if (existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false }));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDir }));
}
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError)
    return res
      .status(400)
      .json({ error: error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ') });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (
    error.code?.startsWith('SQLITE_CONSTRAINT') ||
    (error.code === 'ERR_SQLITE_ERROR' && /constraint failed/i.test(error.message))
  )
    return res
      .status(409)
      .json({ error: 'This operation conflicts with an existing request or job.' });
  log('error', error.message || 'Unexpected error');
  res.status(500).json({
    error: 'The server could not complete this operation. An administrator can check the logs.',
  });
});
