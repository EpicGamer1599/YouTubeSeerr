// Isolated browser-test server. Never used by production entrypoints.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('test-results', { recursive: true });
process.env.CONFIG_DIR = mkdtempSync(resolve('test-results/browser-db-'));
delete process.env.YOUTUBE_API_KEY;
delete process.env.JELLYFIN_API_KEY;
const videoId = 'UUUUUUUUUUU',
  channelId = 'UC' + 'U'.repeat(22);
// Deterministic, explicitly isolated visual fixtures; no demo records enter production.
const videos = [
  ['Across the Alps: a journey by rail', 'Field Notes'],
  ['How a mechanical watch keeps time', 'Made by Hand'],
  ['The hidden world beneath the ocean', 'Earth Archive'],
  ['Building a quieter home server', 'Home Lab'],
  ['A walk through Kyoto in the rain', 'Slow Travel'],
  ['The extraordinary rings of Saturn', 'Orbital'],
  ['Inside a small Japanese woodworking studio', 'Made by Hand'],
  ['A field guide to the night sky', 'Orbital'],
  ['Designing a city for people', 'Open City'],
  ['Why we listen to music', 'Sound Studies'],
  ['A year in the Scottish Highlands', 'Field Notes'],
  ['Making a film with natural light', 'Frame by Frame'],
].map(([title, channel], i) => ({ id: 'V' + String(i + 1).padStart(10, '0'), title, channel }));
const channels = [
  { id: channelId, title: 'Field Notes' },
  { id: 'UC' + 'F'.repeat(22), title: 'Orbital' },
];
const playlists = [
  { id: 'PL' + 'P'.repeat(22), title: 'Journeys worth taking' },
  { id: 'PL' + 'S'.repeat(22), title: 'The home server collection' },
  { id: 'PL' + 'N'.repeat(22), title: 'New discoveries' },
];
function thumbnail(index: number) {
  const colors = [
    ['#34515d', '#b1c4c3', '#507985'],
    ['#4c4145', '#d6b992', '#786857'],
    ['#183e50', '#7db6c1', '#245f70'],
    ['#283342', '#8395b4', '#3e506c'],
    ['#3f4945', '#b5ba9c', '#596657'],
    ['#2f304b', '#b3a4c6', '#535775'],
  ];
  const [back, light, front] = colors[index % colors.length];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="' +
    back +
    '"/><circle cx="' +
    (400 + ((index * 7) % 160)) +
    '" cy="100" r="58" fill="' +
    light +
    '"/><path d="M0 285L140 122L282 280L391 170L640 315V360H0Z" fill="' +
    front +
    '"/><path d="M0 324L213 227L370 327L590 225L640 288V360H0Z" fill="' +
    back +
    '" opacity=".75"/><text x="28" y="42" font-family="Arial,sans-serif" font-size="14" letter-spacing="3" fill="' +
    light +
    '">BROWSER TEST FIXTURE</text></svg>';
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
function videoResource(id: string) {
  const index = Math.max(
    0,
    videos.findIndex((v) => v.id === id),
  );
  const v = videos.find((v) => v.id === id) || {
    title: 'Browser integration test video',
    channel: 'Test creator',
  };
  return {
    id,
    snippet: {
      title: v.title,
      channelTitle: v.channel,
      channelId,
      description:
        'This media record exists only in the isolated browser test database. It exercises long descriptions, metadata, requests, and responsive layouts without contacting a real account.',
      publishedAt: '2026-08-' + String(index + 1).padStart(2, '0') + 'T00:00:00Z',
      thumbnails: { high: { url: thumbnail(index) } },
    },
    contentDetails: { duration: 'PT' + (12 + index) + 'M' + (10 + index) + 'S' },
  };
}
function collectionResource(id: string, type: string) {
  const c = [...channels, ...playlists].find((v) => v.id === id);
  return {
    id,
    snippet: {
      title: c?.title || 'Test collection',
      channelTitle: type === 'channel' ? c?.title : 'Field Notes',
      channelId,
      description:
        'An isolated test collection for request scopes, selected videos, and administrator approval.',
      thumbnails: { high: { url: thumbnail(type === 'channel' ? 4 : 0) } },
    },
    statistics: { subscriberCount: '248000' },
    contentDetails: { itemCount: 6, relatedPlaylists: { uploads: 'UU' + 'U'.repeat(22) } },
  };
}
globalThis.fetch = async (input: any, init: any = {}) => {
  const u = new URL(String(input));
  if (u.hostname === 'jellyfin.test') {
    if (u.pathname === '/System/Info/Public')
      return Response.json({ Id: 'test', ServerName: 'Browser Test Jellyfin', Version: '10.10' });
    if (u.pathname === '/Users/AuthenticateByName') {
      const b = JSON.parse(init.body);
      if (b.Pw !== 'test-password') return new Response(null, { status: 401 });
      return Response.json({
        User: {
          Id: (b.Username === 'admin' ? 'a' : 'b').repeat(32),
          Name: b.Username,
          Policy: { IsAdministrator: b.Username === 'admin' },
        },
        AccessToken: b.Username + '-test-token',
      });
    }
    if (u.pathname === '/Users/Me') {
      const admin = String(init.headers.Authorization).includes('admin');
      return Response.json({
        Id: (admin ? 'a' : 'b').repeat(32),
        Name: admin ? 'admin' : 'member',
        Policy: { IsAdministrator: admin },
      });
    }
    if (u.pathname === '/Library/VirtualFolders')
      return Response.json([{ ItemId: 'd'.repeat(32), Name: 'YouTube', CollectionType: 'movies' }]);
  }
  if (u.hostname === 'www.googleapis.com') {
    if (u.pathname.endsWith('/search')) {
      const q = u.searchParams.get('q') || '';
      if (q === 'no matches') return Response.json({ items: [] });
      if (q === 'quota failure')
        return Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
      if (q === 'a test video') return Response.json({ items: [{ id: { videoId } }] });
      const type = u.searchParams.get('type') || 'video,channel,playlist';
      const ids = type.includes('video') ? videos.map((v) => ({ id: { videoId: v.id } })) : [];
      if (type.includes('channel'))
        ids.push(...(channels.map((v) => ({ id: { channelId: v.id } })) as any));
      if (type.includes('playlist'))
        ids.push(...(playlists.map((v) => ({ id: { playlistId: v.id } })) as any));
      return Response.json({ items: ids });
    }
    const ids = (u.searchParams.get('id') || '').split(',');
    if (u.pathname.endsWith('/videos'))
      return Response.json({ items: ids.map((id) => videoResource(id)) });
    if (u.pathname.endsWith('/channels'))
      return Response.json({ items: ids.map((id) => collectionResource(id, 'channel')) });
    if (u.pathname.endsWith('/playlists'))
      return Response.json({ items: ids.map((id) => collectionResource(id, 'playlist')) });
    if (u.pathname.endsWith('/playlistItems'))
      return Response.json({
        items: videos.slice(0, 6).map((v) => ({ contentDetails: { videoId: v.id } })),
      });
  }
  throw new Error('Unexpected request in browser fixture.');
};
const { app } = await import('../server/app.js');
// Test-only wrapper: fixture controls never exist in the production app.
const { default: express } = await import('express');
const { run, one } = await import('../server/db.js');
const { details } = await import('../server/youtube.js');
const { syncRequests } = await import('../server/requests.js');
const harness = express();
harness.use(express.json());
let seeded = false;
harness.post('/__test/activity', async (_req, res) => {
  if (!seeded) {
    for (let i = 4; i < 12; i++) {
      const m = await details('video', videos[i].id);
      const status = [
        'PENDING',
        'DOWNLOADING',
        'PROCESSING',
        'AVAILABLE',
        'FAILED',
        'QUEUED',
        'REJECTED',
        'CANCELLED',
      ][i - 4];
      const now = Date.now() - i * 3600000;
      const id = Number(
        run(
          'INSERT INTO requests(user_id,media_id,status,mode,options,created_at,updated_at,approved_by,error) VALUES(?,?,?,?,?,?,?,?,?)',
          'b'.repeat(32),
          m.id,
          status,
          'video',
          JSON.stringify({ selectedIds: [], recentCount: 10 }),
          now,
          now,
          status === 'PENDING' ? null : 'a'.repeat(32),
          status === 'REJECTED' ? 'Not for this library.' : null,
        ).lastInsertRowid,
      );
      if (!['PENDING', 'REJECTED', 'CANCELLED'].includes(status)) {
        run('INSERT INTO request_items VALUES(?,?)', id, m.id);
        run(
          'INSERT INTO jobs(kind,media_id,request_id,status,progress,speed,eta,attempts,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          'download',
          m.id,
          id,
          status,
          status === 'DOWNLOADING'
            ? 64.7
            : status === 'PROCESSING' || status === 'AVAILABLE'
              ? 100
              : 0,
          status === 'DOWNLOADING' ? 4500000 : null,
          status === 'DOWNLOADING' ? 83 : null,
          1,
          status === 'FAILED'
            ? 'The remote video is temporarily unavailable. Try again later. (Isolated test failure.)'
            : null,
          now,
          now,
        );
        if (status === 'AVAILABLE')
          run(
            'INSERT INTO downloads VALUES(?,?,?)',
            m.id,
            '/isolated-test-library/' + m.id + '.mkv',
            now,
          );
      }
    }
    seeded = true;
  }
  run(
    "INSERT INTO heartbeats VALUES('worker',?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at",
    Date.now(),
  );
  syncRequests();
  res.json({ ok: true });
});
harness.post('/__test/progress', (_req, res) => {
  run("UPDATE jobs SET progress=78.2,speed=5242880,eta=42 WHERE status='DOWNLOADING'");
  res.json({ ok: true });
});
harness.use(app);
harness.listen(5067, '127.0.0.1', () => console.log('Browser test server ready on 5067.'));
