import { test } from 'node:test';
import assert from 'node:assert/strict';
const required = [
  'LIVE_APP_URL',
  'LIVE_USER',
  'LIVE_PASSWORD',
  'LIVE_ADMIN',
  'LIVE_ADMIN_PASSWORD',
  'LIVE_VIDEO_ID',
  'LIVE_JELLYFIN_URL',
  'LIVE_JELLYFIN_API_KEY',
];
const missing = required.filter((k) => !process.env[k]);
test(
  'live acceptance: real Jellyfin user → YouTube search → approved yt-dlp job → visible Jellyfin item',
  { skip: missing.length ? 'Missing ' + missing.join(', ') : false, timeout: 1800000 },
  async () => {
    // No mocked service, subprocess, downloader, or data. This requests and downloads real media.
    const base = process.env.LIVE_APP_URL!.replace(/\/$/, '');
    async function login(username: string, password: string) {
      const response = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200);
      const d = (await response.json()) as any;
      return {
        cookie: response.headers.get('set-cookie')!.split(';')[0],
        csrf: d.csrf,
        user: d.user,
      };
    }
    const user = await login(process.env.LIVE_USER!, process.env.LIVE_PASSWORD!),
      admin = await login(process.env.LIVE_ADMIN!, process.env.LIVE_ADMIN_PASSWORD!);
    assert(!user.user.isAdmin, 'Use a normal Jellyfin user for LIVE_USER.');
    assert(admin.user.isAdmin);
    async function call(session: any, path: string, method = 'GET', body?: unknown) {
      const r = await fetch(base + '/api' + path, {
        method,
        headers: {
          Cookie: session.cookie,
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
        },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      });
      const d = (await r.json()) as any;
      assert(r.ok, d.error || String(r.status));
      return d;
    }
    const results = await call(
      user,
      '/search?type=video&q=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + process.env.LIVE_VIDEO_ID),
    );
    const media = results.items[0];
    assert(media);
    assert(!media.status, 'Use a video not previously requested or downloaded.');
    const req = await call(user, '/requests', 'POST', { type: 'video', mediaId: media.id });
    await call(admin, '/requests/' + req.id + '/approve', 'POST');
    const until = Date.now() + 1500000;
    let available = false,
      sawProgress = false;
    while (Date.now() < until) {
      const rows = await call(user, '/requests'),
        r = rows.find((r: any) => r.id === req.id);
      assert(r);
      assert.notEqual(r.status, 'FAILED', r.error);
      const queue = await call(user, '/downloads');
      if (queue.jobs.some((j: any) => j.media_id === media.id && j.progress > 0))
        sawProgress = true;
      if (r.status === 'AVAILABLE') {
        available = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(available, 'Timed out waiting for the real download.');
    assert(sawProgress, 'No real yt-dlp progress was reported.');
    await call(admin, '/jellyfin/refresh', 'POST');
    let jellyfinFound = false;
    for (let n = 0; n < 120; n++) {
      const u = new URL(process.env.LIVE_JELLYFIN_URL!.replace(/\/$/, '') + '/Items');
      u.searchParams.set('Recursive', 'true');
      u.searchParams.set('Fields', 'Path,ProviderIds');
      u.searchParams.set('SearchTerm', media.title);
      u.searchParams.set('Limit', '100');
      const r = await fetch(u, {
        headers: {
          Authorization: 'MediaBrowser Token="' + process.env.LIVE_JELLYFIN_API_KEY + '"',
        },
      });
      assert(r.ok, 'Jellyfin library query failed.');
      const d = (await r.json()) as any;
      if (
        d.Items?.some((i: any) => i.Path?.includes(media.id) || i.ProviderIds?.youtube === media.id)
      ) {
        jellyfinFound = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    assert(
      jellyfinFound,
      'Downloaded media was not discovered by Jellyfin. Check the shared volume and library configuration.',
    );
    await call(user, '/auth/logout', 'POST');
    await call(admin, '/auth/logout', 'POST');
  },
);
