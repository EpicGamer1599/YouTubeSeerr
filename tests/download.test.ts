import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import ffmpeg from 'ffmpeg-static';
import request from 'supertest';
mkdirSync('test-results', { recursive: true });
process.env.CONFIG_DIR = mkdtempSync(resolve('test-results/real-download-'));
process.env.YTDLP_BIN =
  process.env.YTDLP_BIN ||
  (existsSync('.tools/yt-dlp.exe') ? resolve('.tools/yt-dlp.exe') : 'yt-dlp');
process.env.FFMPEG_BIN = ffmpeg!;
let binaryAvailable = true;
try {
  execFileSync(process.env.YTDLP_BIN, ['--version'], { stdio: 'pipe', windowsHide: true });
} catch {
  binaryAvailable = false;
}

test(
  'offline integration: login → search → request → approve → real yt-dlp/FFmpeg → library → refresh',
  {
    skip: !binaryAvailable
      ? 'Install yt-dlp or set YTDLP_BIN to run the real download integration test.'
      : false,
    timeout: 60000,
  },
  async () => {
    // Only external authentication/metadata responses are fixtures. The downloader is the real executable.
    const vid = 'DDDDDDDDDDD',
      cid = 'UC' + 'D'.repeat(22),
      adminId = 'a'.repeat(32),
      memberId = 'b'.repeat(32);
    const work = process.env.CONFIG_DIR!,
      source = resolve(work, 'source.mp4');
    execFileSync(
      ffmpeg!,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x180:rate=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440',
        '-t',
        '2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        source,
      ],
      { windowsHide: true },
    );
    const bytes = readFileSync(source);
    let downloadedBytes = 0,
      refreshes = 0,
      progressEvents = 0;
    const mediaServer = createServer((_req, res) => {
      downloadedBytes += bytes.length;
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length });
      res.end(bytes);
    });
    await new Promise<void>((r) => mediaServer.listen(0, '127.0.0.1', r));
    const sourceUrl = 'http://127.0.0.1:' + (mediaServer.address() as any).port + '/source.mp4';
    const infoPath = resolve(work, 'fixture.info.json');
    writeFileSync(
      infoPath,
      JSON.stringify({
        id: vid,
        title: 'Real pipeline test',
        url: sourceUrl,
        webpage_url: sourceUrl,
        extractor: 'generic',
        extractor_key: 'Generic',
        ext: 'mp4',
        duration: 2,
        height: 180,
        width: 320,
        fps: 10,
        vcodec: 'h264',
        acodec: 'aac',
      }),
    );
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input: any, init: any = {}) => {
      const u = new URL(String(input));
      if (u.hostname === 'jellyfin.fixture') {
        if (u.pathname === '/Users/AuthenticateByName') {
          const b = JSON.parse(init.body);
          return Response.json({
            User: {
              Id: b.Username === 'admin' ? adminId : memberId,
              Name: b.Username,
              Policy: { IsAdministrator: b.Username === 'admin' },
            },
            AccessToken: b.Username + '-token',
          });
        }
        if (u.pathname === '/Library/Refresh') {
          refreshes++;
          return new Response(null, { status: 204 });
        }
      }
      if (u.hostname === 'www.googleapis.com') {
        if (u.pathname.endsWith('/search'))
          return Response.json({ items: [{ id: { videoId: vid } }] });
        if (u.pathname.endsWith('/videos'))
          return Response.json({
            items: [
              {
                id: vid,
                snippet: {
                  title: 'Real pipeline test',
                  description: 'Generated two-second audiovisual test fixture.',
                  channelTitle: 'Integration Tests',
                  channelId: cid,
                  publishedAt: '2024-01-01T00:00:00Z',
                },
                contentDetails: { duration: 'PT2S' },
              },
            ],
          });
      }
      throw new Error('Unexpected fixture API request.');
    };
    const { app } = await import('../server/app.js'),
      { one, db } = await import('../server/db.js'),
      { settings } = await import('../server/config.js');
    const { claimJob, executeJob } = await import('../server/worker.js');
    const { runDownloader, downloaderArgs } = await import('../server/downloader.js');
    try {
      const admin = request.agent(app),
        member = request.agent(app);
      const auth = await admin
          .post('/api/setup/connect')
          .send({ url: 'http://jellyfin.fixture', username: 'admin', password: 'test' })
          .expect(200),
        ac = auth.body.csrf;
      await admin
        .post('/api/setup/finish')
        .set('x-csrf-token', ac)
        .send({
          youtubeKey: 'fixture-key',
          downloadDir: resolve(work, 'staging'),
          mediaDir: resolve(work, 'library'),
          retries: 0,
          writeMetadata: true,
        })
        .expect(200);
      const login = await member
          .post('/api/auth/login')
          .send({ username: 'member', password: 'test' })
          .expect(200),
        mc = login.body.csrf;
      const found = await member.get('/api/search?q=fixture&type=video').expect(200);
      assert.equal(found.body.items[0].id, vid);
      const created = await member
        .post('/api/requests')
        .set('x-csrf-token', mc)
        .send({ mediaId: vid, type: 'video' })
        .expect(201);
      await admin
        .post('/api/requests/' + created.body.id + '/approve')
        .set('x-csrf-token', ac)
        .send({})
        .expect(200);
      const job = claimJob('real-download-test');
      await executeJob(job, new AbortController(), (m, s, staging, progress, log, signal) => {
        const args = downloaderArgs(m, s, staging).slice(0, -2);
        // Feed a local metadata fixture to yt-dlp; it performs the real HTTP transfer and FFmpeg remux.
        args.push('--load-info-json', infoPath);
        return runDownloader(
          args,
          (p) => {
            progressEvents++;
            progress(p);
          },
          log,
          signal,
        );
      });
      const finalJob = one('SELECT * FROM jobs WHERE id=?', job.id);
      assert.equal(finalJob.status, 'AVAILABLE', finalJob.error || 'Download failed');
      assert(downloadedBytes >= bytes.length);
      assert(progressEvents > 0);
      const file = one('SELECT * FROM downloads WHERE media_id=?', vid);
      assert(file);
      assert(file.path.endsWith('.mkv'));
      assert(statSync(file.path).size > 1000);
      assert(existsSync(resolve(dirname(file.path), 'movie.nfo')));
      execFileSync(ffmpeg!, ['-v', 'error', '-i', file.path, '-f', 'null', '-'], {
        windowsHide: true,
      });
      const req = await member.get('/api/requests').expect(200);
      assert.equal(req.body[0].status, 'AVAILABLE');
      const refresh = claimJob('real-refresh-test');
      assert.equal(refresh.kind, 'refresh');
      await executeJob(refresh);
      assert.equal(refreshes, 1);
    } finally {
      globalThis.fetch = realFetch;
      await new Promise<void>((r) => mediaServer.close(() => r()));
      db.close();
    }
  },
);
