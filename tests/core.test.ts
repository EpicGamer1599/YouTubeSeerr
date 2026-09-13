import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import request from 'supertest';

mkdirSync('test-results', { recursive: true });
process.env.CONFIG_DIR = mkdtempSync(resolve('test-results/core-'));
delete process.env.YOUTUBE_API_KEY;
delete process.env.JELLYFIN_API_KEY;
const { app } = await import('../server/app.js');
const { all, one, run, db, migrate } = await import('../server/db.js');
const { settings, setValue, setSecret, secret, encrypt, decrypt } =
  await import('../server/config.js');
const { claimJob, recoverJobs, executeJob } = await import('../server/worker.js');
const { downloaderArgs } = await import('../server/downloader.js');
const { sanitizeFilename, inside, nfo, publishMedia } = await import('../server/files.js');
const { mediaUrl, cacheMedia } = await import('../server/youtube.js');
const { syncRequests } = await import('../server/requests.js');
const realFetch = globalThis.fetch;
const adminId = 'a'.repeat(32),
  userId = 'b'.repeat(32),
  otherId = 'c'.repeat(32);
const vid = 'AAAAAAAAAAA',
  vid2 = 'BBBBBBBBBBB',
  channel = 'UC' + 'A'.repeat(22),
  playlist = 'PL' + 'P'.repeat(20);
const makeVideo = (id = vid) => ({
  id,
  snippet: {
    title: 'Test <video>: / 😀',
    description: 'A & B < C',
    channelTitle: 'Test Channel',
    channelId: channel,
    publishedAt: '2024-01-02T00:00:00Z',
    thumbnails: { high: { url: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' } },
  },
  contentDetails: { duration: 'PT1M23S' },
});
let remoteAdmin = true,
  remoteDisabled = false,
  refreshCalls = 0,
  searchCalls = 0,
  failYouTube = false;
const remote = (name: string) => ({
  Id: name === 'admin' ? adminId : name === 'other' ? otherId : userId,
  Name: name,
  Policy: { IsAdministrator: name === 'admin' && remoteAdmin, IsDisabled: remoteDisabled },
});
globalThis.fetch = async (input: any, init: any = {}) => {
  const u = new URL(String(input)),
    path = u.pathname;
  if (u.hostname === 'jellyfin.test') {
    if (path === '/System/Info/Public')
      return Response.json({ Id: 'server', ServerName: 'Test Jellyfin', Version: '10.10' });
    if (path === '/Users/AuthenticateByName') {
      const b = JSON.parse(init.body);
      if (b.Pw !== 'correct') return new Response('', { status: 401 });
      return Response.json({ User: remote(b.Username), AccessToken: b.Username + '-secret-token' });
    }
    if (path === '/Users/Me') {
      const auth = init.headers.Authorization || '';
      return Response.json(
        remote(
          auth.includes('admin-secret')
            ? 'admin'
            : auth.includes('other-secret')
              ? 'other'
              : 'member',
        ),
      );
    }
    if (path === '/Library/VirtualFolders')
      return Response.json([
        {
          ItemId: 'd'.repeat(32),
          Name: 'YouTube',
          Locations: ['/private/path'],
          CollectionType: 'movies',
        },
      ]);
    if (path === '/Library/Refresh' || path.endsWith('/Refresh')) {
      refreshCalls++;
      return new Response(null, { status: 204 });
    }
  }
  if (u.hostname === 'www.googleapis.com') {
    if (failYouTube)
      return Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
    if (path.endsWith('/search')) {
      searchCalls++;
      return Response.json({ items: [{ id: { videoId: vid } }], nextPageToken: 'next' });
    }
    if (path.endsWith('/videos'))
      return Response.json({
        items: (u.searchParams.get('id') || vid).split(',').map((id) => makeVideo(id)),
      });
    if (path.endsWith('/channels'))
      return Response.json({
        items: [
          {
            id: channel,
            snippet: { title: 'Test Channel' },
            contentDetails: { relatedPlaylists: { uploads: 'UU' + 'A'.repeat(22) } },
          },
        ],
      });
    if (path.endsWith('/playlists'))
      return Response.json({
        items: [
          { id: playlist, snippet: { title: 'Test playlist' }, contentDetails: { itemCount: 2 } },
        ],
      });
    if (path.endsWith('/playlistItems'))
      return Response.json({
        items: [{ contentDetails: { videoId: vid } }, { contentDetails: { videoId: vid2 } }],
      });
  }
  throw new Error('Unexpected external request in contract test: ' + u.origin + path);
};
const admin = request.agent(app),
  member = request.agent(app),
  other = request.agent(app);
let adminCsrf = '',
  memberCsrf = '',
  otherCsrf = '',
  requestId = 0;

after(() => {
  globalThis.fetch = realFetch;
  db.close();
});
test('migrations are repeatable and SQLite uses WAL', () => {
  migrate();
  assert.equal(one('PRAGMA journal_mode').journal_mode, 'wal');
  assert.equal(one('SELECT COUNT(*) n FROM schema_migrations').n, 1);
  assert.equal(all("SELECT name FROM sqlite_master WHERE type='table'").length >= 13, true);
});
test('protected APIs reject unauthenticated clients', async () => {
  for (const path of ['/requests', 'settings', 'downloads', 'users', 'logs'])
    await request(app)
      .get('/api/' + path.replace(/^\//, ''))
      .expect(401);
});
test('first-run connection test and non-admin setup denial', async () => {
  await request(app).post('/api/setup/test').send({ url: 'http://jellyfin.test' }).expect(200);
  await request(app)
    .post('/api/setup/connect')
    .send({ url: 'http://jellyfin.test', username: 'member', password: 'correct' })
    .expect(403);
  assert.equal(one('SELECT COUNT(*) n FROM users').n, 0);
});
test('Jellyfin authentication rejects wrong passwords', async () => {
  await request(app)
    .post('/api/setup/connect')
    .send({ url: 'http://jellyfin.test', username: 'admin', password: 'wrong' })
    .expect(401);
});
test('administrator connects Jellyfin; cookies and tokens are secure', async () => {
  const r = await admin
    .post('/api/setup/connect')
    .send({ url: 'http://jellyfin.test', username: 'admin', password: 'correct' })
    .expect(200);
  adminCsrf = r.body.csrf;
  assert.equal(r.body.user.id, adminId);
  assert.equal(r.body.user.isAdmin, true);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.match(r.headers['set-cookie'][0], /SameSite=Lax/);
  assert(!JSON.stringify(r.body).includes('secret-token'));
  assert.equal(secret('jellyfinToken'), 'admin-secret-token');
  const session = one('SELECT * FROM sessions');
  assert.equal(session.id.length, 64);
  assert(!session.token.includes('admin-secret'));
  assert.equal(decrypt(session.token), 'admin-secret-token');
  assert(
    !readFileSync(resolve(process.env.CONFIG_DIR!, 'youtubeseerr.db')).includes(
      Buffer.from('correct'),
    ),
  );
});
test('setup cannot be claimed a second time', async () => {
  await request(app)
    .post('/api/setup/connect')
    .send({ url: 'http://jellyfin.test', username: 'admin', password: 'correct' })
    .expect(409);
});
test('CSRF, origin, and JSON content type are enforced', async () => {
  await admin.put('/api/settings').send({ appName: 'Changed' }).expect(403);
  await admin
    .put('/api/settings')
    .set('x-csrf-token', adminCsrf)
    .set('Origin', 'https://evil.test')
    .send({})
    .expect(403);
  await admin
    .put('/api/settings')
    .set('x-csrf-token', adminCsrf)
    .type('form')
    .send({ appName: 'Changed' })
    .expect(415);
});
test('setup persists validated settings without returning secrets', async () => {
  const r = await admin
    .post('/api/setup/finish')
    .set('x-csrf-token', adminCsrf)
    .send({
      youtubeKey: 'youtube-test-key',
      downloadDir: resolve(process.env.CONFIG_DIR!, 'staging'),
      mediaDir: resolve(process.env.CONFIG_DIR!, 'media'),
      retries: 0,
    })
    .expect(200);
  assert(r.body.ok);
  await request(app)
    .get('/api/setup')
    .expect((r) => assert.equal(r.body.configured, true));
  const s = await admin.get('/api/settings').expect(200);
  assert(s.body.hasYoutubeKey);
  assert(!JSON.stringify(s.body).includes('youtube-test-key'));
  assert(!JSON.stringify(s.body).includes('admin-secret-token'));
});
test('existing Jellyfin users log in without registering again', async () => {
  const a = await member
    .post('/api/auth/login')
    .send({ username: 'member', password: 'correct' })
    .expect(200);
  memberCsrf = a.body.csrf;
  assert.equal(a.body.user.isAdmin, false);
  assert.equal(a.body.user.id, userId);
  const b = await other
    .post('/api/auth/login')
    .send({ username: 'other', password: 'correct' })
    .expect(200);
  otherCsrf = b.body.csrf;
  await member.get('/api/auth/me').expect((r) => assert.equal(r.body.user.username, 'member'));
});
test('all administrative reads and writes reject regular users', async () => {
  for (const path of ['/settings', '/users', '/logs', '/jellyfin/libraries'])
    await member.get('/api' + path).expect(403);
  for (const path of [
    '/requests/1/approve',
    '/requests/1/reject',
    '/requests/1/retry',
    '/jobs/1/cancel',
    '/jobs/1/retry',
    '/jellyfin/refresh',
    '/jellyfin/test',
  ])
    await member
      .post('/api' + path)
      .set('x-csrf-token', memberCsrf)
      .send({})
      .expect(403);
  await member
    .put('/api/settings')
    .set('x-csrf-token', memberCsrf)
    .send({ concurrency: 6 })
    .expect(403);
  await member
    .patch('/api/users/' + adminId)
    .set('x-csrf-token', memberCsrf)
    .send({ localAdmin: true, disabled: false })
    .expect(403);
  await member.delete('/api/jobs/1').set('x-csrf-token', memberCsrf).send({}).expect(403);
});
test('official search returns enriched metadata and caches repeated queries', async () => {
  const r = await member.get('/api/search?q=test&type=video').expect(200);
  assert.equal(r.body.items[0].id, vid);
  assert.equal(r.body.items[0].duration, 'PT1M23S');
  assert.equal(r.body.items[0].channel, 'Test Channel');
  assert.equal(r.body.items[0].status, null);
  await member.get('/api/search?q=test&type=video').expect(200);
  assert.equal(searchCalls, 1);
});
test('YouTube failures expose helpful errors without API keys', async () => {
  failYouTube = true;
  const r = await member.get('/api/search?q=quota&type=video').expect(502);
  assert.match(r.body.error, /quota/);
  assert(!JSON.stringify(r.body).includes('youtube-test-key'));
  failYouTube = false;
});
test('YouTube IDs and hostile URLs are rejected', async () => {
  for (const value of [
    'https://evil.test/video',
    'file:///etc/passwd',
    'https://youtube.com/watch?v=../../../foo',
  ])
    await member
      .get('/api/search?q=' + encodeURIComponent(value))
      .expect((r) => assert([400, 502].includes(r.status)));
  assert.throws(() => mediaUrl('video', 'x; rm -rf /'));
  assert.throws(() => mediaUrl('channel', '../../etc'));
});
test('user creates a real persistent request, with duplicate protection', async () => {
  const r = await member
    .post('/api/requests')
    .set('x-csrf-token', memberCsrf)
    .send({ type: 'video', mediaId: vid, mode: 'video' })
    .expect(201);
  requestId = r.body.id;
  assert.equal(one('SELECT status FROM requests WHERE id=?', requestId).status, 'PENDING');
  await member
    .post('/api/requests')
    .set('x-csrf-token', memberCsrf)
    .send({ type: 'video', mediaId: vid })
    .expect(409);
});
test('request privacy and cancellation ownership are enforced', async () => {
  const own = await member.get('/api/requests').expect(200),
    others = await other.get('/api/requests').expect(200),
    adminRows = await admin.get('/api/requests').expect(200);
  assert.equal(own.body.length, 1);
  assert.equal(others.body.length, 0);
  assert.equal(adminRows.body[0].requester, 'member');
  await other
    .post('/api/requests/' + requestId + '/cancel')
    .set('x-csrf-token', otherCsrf)
    .send({})
    .expect(403);
});
test('approval creates a durable queue job outside the HTTP handler', async () => {
  await admin
    .post('/api/requests/' + requestId + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
  assert.equal(one('SELECT status FROM requests WHERE id=?', requestId).status, 'QUEUED');
  assert.equal(one("SELECT COUNT(*) n FROM jobs WHERE kind='download'").n, 1);
  await member
    .post('/api/requests/' + requestId + '/cancel')
    .set('x-csrf-token', memberCsrf)
    .send({})
    .expect(403);
  await admin
    .post('/api/requests/' + requestId + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(409);
});
test('queue information is scoped to the requesting user', async () => {
  const r = await member.get('/api/downloads').expect(200);
  assert.equal(r.body.jobs.length, 1);
  assert.equal(r.body.jobs[0].position, 1);
  const o = await other.get('/api/downloads').expect(200);
  assert.equal(o.body.jobs.length, 0);
  assert(!JSON.stringify(r.body).includes('path'));
});
test('claiming is atomic and restart recovery requeues expired leases', () => {
  const j = claimJob('test-worker');
  assert.equal(j.media_id, vid);
  assert.equal(claimJob('other-worker'), null);
  run('UPDATE jobs SET lease_until=? WHERE id=?', Date.now() - 1, j.id);
  recoverJobs();
  assert.equal(one('SELECT status FROM jobs WHERE id=?', j.id).status, 'QUEUED');
});
test('real process launch failures reach FAILED and can be retried', async () => {
  const previous = process.env.YTDLP_BIN;
  process.env.YTDLP_BIN = resolve(process.env.CONFIG_DIR!, 'missing-yt-dlp');
  const j = claimJob('failure-test');
  await executeJob(j);
  assert.equal(one('SELECT status FROM jobs WHERE id=?', j.id).status, 'FAILED');
  assert.equal(one('SELECT status FROM requests WHERE id=?', requestId).status, 'FAILED');
  if (previous) process.env.YTDLP_BIN = previous;
  else delete process.env.YTDLP_BIN;
  await admin
    .post('/api/requests/' + requestId + '/retry')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
  assert.equal(one('SELECT status FROM jobs WHERE id=?', j.id).status, 'QUEUED');
});
test('yt-dlp invocation uses constrained arguments and structured progress', () => {
  const m = JSON.parse(one('SELECT data FROM media WHERE id=?', vid).data);
  const args = downloaderArgs(m, settings(), resolve(process.env.CONFIG_DIR!, 'staging'));
  assert(args.includes('--ignore-config'));
  assert(args.includes('--no-playlist'));
  assert(args.includes('--continue'));
  assert(args.includes('download:PROGRESS:%(progress)j'));
  assert.equal(args.at(-1), 'https://www.youtube.com/watch?v=' + vid);
  assert.equal(args.at(-2), '--');
  assert(!args.includes('--exec'));
  const audio = downloaderArgs(m, { ...settings(), outputMode: 'audio' }, '/staging');
  assert(audio.includes('--audio-format'));
  assert(audio.includes('mp3'));
});
test('filename handling preserves Unicode, avoids reserved names and bounds lengths', () => {
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('../a:b?*'), '.._a_b__');
  assert.equal(sanitizeFilename('hello 😀'), 'hello 😀');
  assert.equal(sanitizeFilename('...'), 'Untitled');
  assert.equal(Array.from(sanitizeFilename('😀'.repeat(200))).length, 80);
  assert(!/[<>:"/\\|?*%]/.test(sanitizeFilename('a/b\\c:d%?')));
  assert.throws(() => inside('/root', '/other/file'));
});
test('publication organizes media with escaped NFO and never accepts outside paths', async () => {
  const m = JSON.parse(one('SELECT data FROM media WHERE id=?', vid).data),
    staging = resolve(process.env.CONFIG_DIR!, 'publication');
  mkdirSync(staging);
  writeFileSync(join(staging, 'video.mkv'), Buffer.from('test publication bytes')); // Filesystem unit fixture, not a downloader.
  const path = await publishMedia(
    m,
    join(staging, 'video.mkv'),
    staging,
    settings().mediaDir,
    true,
  );
  assert(existsSync(path));
  assert(path.includes(vid));
  assert(existsSync(resolve(path, '../movie.nfo')));
  assert.match(nfo(m), /A &amp; B &lt; C/);
  assert.match(nfo(m), /&lt;video&gt;/);
  await assert.rejects(
    publishMedia(
      m,
      resolve(process.env.CONFIG_DIR!, 'secret.key'),
      staging,
      settings().mediaDir,
      true,
    ),
    /outside/,
  );
});
test('Jellyfin refresh runs as an actual integration job using its API', async () => {
  run("UPDATE jobs SET status='CANCELLED' WHERE kind='download'");
  await admin.post('/api/jellyfin/refresh').set('x-csrf-token', adminCsrf).send({}).expect(200);
  const j = claimJob('refresh-test');
  assert.equal(j.kind, 'refresh');
  await executeJob(j);
  assert.equal(refreshCalls, 1);
  assert.equal(one('SELECT status FROM jobs WHERE id=?', j.id).status, 'AVAILABLE');
  const libs = await admin.get('/api/jellyfin/libraries').expect(200);
  assert(!JSON.stringify(libs.body).includes('private/path'));
});
test('channel-wide approval requires explicit confirmation', async () => {
  const r = await member
    .post('/api/requests')
    .set('x-csrf-token', memberCsrf)
    .send({ type: 'channel', mediaId: channel, mode: 'all' })
    .expect(201);
  await admin
    .post('/api/requests/' + r.body.id + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(400);
  await admin
    .post('/api/requests/' + r.body.id + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({ confirmedAll: true })
    .expect(200);
  const j = claimJob('expand-test');
  await executeJob(j);
  assert.equal(one('SELECT COUNT(*) n FROM request_items WHERE request_id=?', r.body.id).n, 2);
  await admin
    .post('/api/requests/' + r.body.id + '/cancel')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
});
test('playlist new-only subscription establishes a baseline without downloading old videos', async () => {
  run("UPDATE jobs SET status='CANCELLED' WHERE status='QUEUED'");
  const r = await member
    .post('/api/requests')
    .set('x-csrf-token', memberCsrf)
    .send({ type: 'playlist', mediaId: playlist, mode: 'new' })
    .expect(201);
  await admin
    .post('/api/requests/' + r.body.id + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
  const j = claimJob('baseline-test');
  await executeJob(j);
  assert.equal(one('SELECT COUNT(*) n FROM subscription_seen WHERE request_id=?', r.body.id).n, 2);
  assert.equal(one('SELECT COUNT(*) n FROM request_items WHERE request_id=?', r.body.id).n, 0);
  assert.equal(one('SELECT monitoring FROM requests WHERE id=?', r.body.id).monitoring, 1);
});
test('request rejection records an administrator reason', async () => {
  const r = await other
    .post('/api/requests')
    .set('x-csrf-token', otherCsrf)
    .send({ type: 'video', mediaId: vid2 })
    .expect(201);
  await admin
    .post('/api/requests/' + r.body.id + '/reject')
    .set('x-csrf-token', adminCsrf)
    .send({ reason: 'Not for this library.' })
    .expect(200);
  assert.equal(one('SELECT status FROM requests WHERE id=?', r.body.id).status, 'REJECTED');
});
test('administrators can reduce collection scope before approval', async () => {
  const r = await member
    .post('/api/requests')
    .set('x-csrf-token', memberCsrf)
    .send({ type: 'channel', mediaId: channel, mode: 'all' })
    .expect(201);
  await admin
    .post('/api/requests/' + r.body.id + '/approve')
    .set('x-csrf-token', adminCsrf)
    .send({ mode: 'future' })
    .expect(200);
  assert.equal(one('SELECT mode FROM requests WHERE id=?', r.body.id).mode, 'future');
  const detail = await admin.get('/api/media/channel/' + channel).expect(200);
  assert.equal(detail.body.requestId, r.body.id);
  await admin
    .post('/api/requests/' + r.body.id + '/cancel')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
});
test('cancelled collection scans remain retryable and cannot become falsely available', async () => {
  const r = one("SELECT * FROM requests WHERE media_id=? AND mode='new'", playlist);
  const result = run(
    "INSERT INTO jobs(kind,media_id,request_id,created_at,updated_at) VALUES('expand',?,?,?,?)",
    playlist,
    r.id,
    Date.now(),
    Date.now(),
  );
  const id = Number(result.lastInsertRowid);
  await admin
    .post('/api/jobs/' + id + '/cancel')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
  assert.equal(one('SELECT status FROM requests WHERE id=?', r.id).status, 'FAILED');
  await admin
    .delete('/api/jobs/' + id)
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(409);
  await admin
    .post('/api/requests/' + r.id + '/retry')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(200);
  assert.equal(one('SELECT status FROM jobs WHERE id=?', id).status, 'QUEUED');
});
test('numeric job identifiers are validated before querying SQLite', async () => {
  await admin
    .post('/api/jobs/not-a-number/retry')
    .set('x-csrf-token', adminCsrf)
    .send({})
    .expect(400);
});
test('settings validate paths, quality, speed limits and concurrency', async () => {
  for (const b of [
    { mediaDir: '../bad' },
    { quality: '9999' },
    { rateLimit: '1M;whoami' },
    { concurrency: 99 },
    { sessionHours: 0 },
  ])
    await admin.put('/api/settings').set('x-csrf-token', adminCsrf).send(b).expect(400);
});
test('encrypted values roundtrip and reject tampering', () => {
  const encrypted = encrypt('secret');
  assert.equal(decrypt(encrypted), 'secret');
  const b = Buffer.from(encrypted, 'base64');
  b[13] ^= 1;
  assert.throws(() => decrypt(b.toString('base64')));
});
test('Jellyfin administrator revocation is revalidated server-side', async () => {
  remoteAdmin = false;
  run('UPDATE sessions SET checked_at=0 WHERE user_id=?', adminId);
  await admin.get('/api/settings').expect(403);
  remoteAdmin = true;
  run('UPDATE sessions SET checked_at=0 WHERE user_id=?', adminId);
  await admin.get('/api/settings').expect(200);
});
test('disabled local users lose all sessions immediately', async () => {
  await admin
    .patch('/api/users/' + otherId)
    .set('x-csrf-token', adminCsrf)
    .send({ localAdmin: false, disabled: true })
    .expect(200);
  await other.get('/api/auth/me').expect(401);
  assert.equal(one('SELECT COUNT(*) n FROM sessions WHERE user_id=?', otherId).n, 0);
});
test('expired sessions and logout invalidate authentication', async () => {
  await member.post('/api/auth/logout').set('x-csrf-token', memberCsrf).send({}).expect(200);
  await member.get('/api/auth/me').expect(401);
  run('UPDATE sessions SET expires_at=0 WHERE user_id=?', adminId);
  await admin.get('/api/auth/me').expect(401);
});
