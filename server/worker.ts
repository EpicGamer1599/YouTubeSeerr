import { randomUUID } from 'node:crypto';
import { rm, realpath } from 'node:fs/promises';
import { all, one, run, transaction, log } from './db.js';
import { configured, settings } from './config.js';
import { collectionPage, details, type Media } from './youtube.js';
import { enqueue, addVideo, syncRequests } from './requests.js';
import { download } from './downloader.js';
import { inside, safeDirectory, publishMedia } from './files.js';
import { refreshLibrary } from './jellyfin.js';
export function recoverJobs() {
  run(
    "UPDATE jobs SET status='QUEUED',lease_until=NULL,lease_owner=NULL,updated_at=? WHERE status IN ('DOWNLOADING','PROCESSING') AND lease_until<?",
    Date.now(),
    Date.now(),
  );
}
export function claimJob(owner: string) {
  return transaction(() => {
    if (
      one("SELECT COUNT(*) n FROM jobs WHERE status IN ('DOWNLOADING','PROCESSING')").n >=
      settings().concurrency
    )
      return null;
    const j = one(
      "SELECT * FROM jobs WHERE status='QUEUED' AND available_at<=? ORDER BY id LIMIT 1",
      Date.now(),
    );
    if (!j) return null;
    run(
      "UPDATE jobs SET status='DOWNLOADING',attempts=attempts+1,lease_until=?,lease_owner=?,updated_at=? WHERE id=?",
      Date.now() + 30000,
      owner,
      Date.now(),
      j.id,
    );
    return { ...j, attempts: j.attempts + 1, lease_owner: owner };
  });
}
async function expandCollection(job: any, signal: AbortSignal) {
  const r = one(
    'SELECT r.*,m.type FROM requests r JOIN media m ON m.id=r.media_id WHERE r.id=?',
    job.request_id,
  );
  if (!r || r.status === 'CANCELLED') throw new Error('Request cancelled.');
  const opts = JSON.parse(r.options),
    max = settings().maxCollectionItems;
  let pageToken = '',
    count = 0,
    seenCount = 0,
    complete = false;
  const candidates: Media[] = [];
  const baseline = r.mode === 'new' && !opts.baselineComplete;
  const selected = new Set<string>(opts.selectedIds || []),
    found = new Set<string>();
  do {
    if (signal.aborted) throw new Error('Request cancelled.');
    const page = await collectionPage(r.type, r.media_id, pageToken);
    for (const m of page.items) {
      if (++seenCount > max)
        throw new Error(
          'Collection exceeds the configured ' +
            max +
            ' video safety limit. Increase it in Settings or choose a smaller scope.',
        );
      const seen = !!one(
        'SELECT 1 FROM subscription_seen WHERE request_id=? AND video_id=?',
        r.id,
        m.id,
      );
      if (r.mode === 'future' && m.publishedAt && Date.parse(m.publishedAt) <= r.created_at) {
        complete = true;
        continue;
      }
      if (r.mode === 'selected') {
        if (!selected.has(m.id)) continue;
        found.add(m.id);
      }
      if (r.mode === 'recent' && count >= opts.recentCount) {
        complete = true;
        break;
      }
      count++;
      if (baseline) {
        run('INSERT OR IGNORE INTO subscription_seen VALUES(?,?)', r.id, m.id);
        continue;
      }
      if ((r.mode === 'new' || r.mode === 'future') && seen) continue;
      candidates.push(m);
    }
    pageToken = page.nextPageToken || '';
    if (r.mode === 'selected' && found.size === selected.size) complete = true;
  } while (pageToken && !complete);
  if (r.mode === 'selected' && found.size !== selected.size)
    throw new Error(
      'Some selected videos are no longer available in this playlist. Request them individually or submit a new selection.',
    );
  if (signal.aborted) throw new Error('Request cancelled.');
  transaction(() => {
    if (one('SELECT status FROM jobs WHERE id=?', job.id)?.status === 'CANCELLED')
      throw new Error('Request cancelled.');
    for (const m of candidates) {
      addVideo(r.id, m.id);
      run('INSERT OR IGNORE INTO subscription_seen VALUES(?,?)', r.id, m.id);
    }
    if (baseline) {
      opts.baselineComplete = true;
      run('UPDATE requests SET options=? WHERE id=?', JSON.stringify(opts), r.id);
    }
    if (r.monitoring)
      run(
        'UPDATE requests SET next_scan=? WHERE id=?',
        Date.now() + settings().scanMinutes * 60000,
        r.id,
      );
  });
  if (!candidates.length && !r.monitoring)
    throw new Error('No available videos were found in this collection.');
}
export async function executeJob(
  job: any,
  controller = new AbortController(),
  transfer: typeof download = download,
) {
  const owns = () => one('SELECT status,lease_owner FROM jobs WHERE id=?', job.id);
  const beat = setInterval(() => {
    const current = owns();
    if (!current || current.status === 'CANCELLED' || current.lease_owner !== job.lease_owner) {
      controller.abort();
      return;
    }
    run(
      'UPDATE jobs SET lease_until=? WHERE id=? AND lease_owner=?',
      Date.now() + 30000,
      job.id,
      job.lease_owner,
    );
  }, 3000);
  try {
    if (job.kind === 'expand') await expandCollection(job, controller.signal);
    else if (job.kind === 'refresh') await refreshLibrary();
    else {
      const s = settings(),
        m = await details('video', job.media_id);
      const staging = await safeDirectory(s.downloadDir, m.id);
      const source = await transfer(
        m,
        s,
        staging,
        (p) => {
          run(
            "UPDATE jobs SET status=?,progress=?,speed=?,eta=?,updated_at=? WHERE id=? AND lease_owner=? AND status!='CANCELLED'",
            p.processing ? 'PROCESSING' : 'DOWNLOADING',
            p.percent,
            p.speed,
            p.eta,
            Date.now(),
            job.id,
            job.lease_owner,
          );
        },
        (line) => {
          if (line.trim()) log('debug', line, job.id);
        },
        controller.signal,
      );
      if (controller.signal.aborted || owns()?.status === 'CANCELLED')
        throw new Error('Download cancelled.');
      run(
        "UPDATE jobs SET status='PROCESSING',progress=100,updated_at=? WHERE id=?",
        Date.now(),
        job.id,
      );
      const destination = await publishMedia(m, source, staging, s.mediaDir, s.writeMetadata);
      if (controller.signal.aborted || owns()?.status === 'CANCELLED')
        throw new Error('Download cancelled.');
      run(
        'INSERT INTO downloads VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET path=excluded.path,completed_at=excluded.completed_at',
        m.id,
        destination,
        Date.now(),
      );
      if (s.autoRefresh && !one("SELECT id FROM jobs WHERE kind='refresh' AND status='QUEUED'"))
        enqueue('refresh', null, null);
      // Only remove the verified, per-video staging directory after publication.
      try {
        await rm(inside(await realpath(s.downloadDir), staging), { recursive: true, force: true });
      } catch {
        log(
          'warn',
          'Media was published, but staging cleanup failed. Check storage permissions.',
          job.id,
        );
      }
    }
    run(
      "UPDATE jobs SET status='AVAILABLE',progress=100,error=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=? AND status!='CANCELLED'",
      Date.now(),
      job.id,
      job.lease_owner,
    );
    log('info', 'Job completed.', job.id);
  } catch (e: any) {
    const current = owns();
    if (current?.status !== 'CANCELLED' && current?.lease_owner === job.lease_owner) {
      const retry = controller.signal.aborted || job.attempts <= settings().retries;
      run(
        'UPDATE jobs SET status=?,error=?,available_at=?,lease_until=NULL,updated_at=? WHERE id=?',
        retry ? 'QUEUED' : 'FAILED',
        e.message,
        Date.now() + Math.min(300000, 15000 * 2 ** job.attempts),
        Date.now(),
        job.id,
      );
      log('error', e.message, job.id);
    }
  } finally {
    clearInterval(beat);
    syncRequests();
  }
}
export class Worker {
  private timer?: NodeJS.Timeout;
  private active = new Map<number, { controller: AbortController; promise: Promise<void> }>();
  private owner = randomUUID();
  private stopped = false;
  private lastCleanup = 0;
  tick() {
    run(
      "INSERT INTO heartbeats VALUES('worker',?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at",
      Date.now(),
    );
    recoverJobs();
    if (Date.now() - this.lastCleanup > 3600000) {
      run('DELETE FROM sessions WHERE expires_at<?', Date.now());
      run('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 10000)');
      this.lastCleanup = Date.now();
    }
    if (!configured() || this.stopped || settings().queuePaused) return;
    for (const r of all(
      "SELECT id,media_id FROM requests WHERE monitoring=1 AND next_scan<=? AND status NOT IN ('CANCELLED','REJECTED','FAILED')",
      Date.now(),
    )) {
      transaction(() => {
        if (
          !one(
            "SELECT id FROM jobs WHERE request_id=? AND kind='expand' AND status IN ('QUEUED','DOWNLOADING','PROCESSING')",
            r.id,
          )
        )
          enqueue('expand', r.media_id, r.id);
      });
    }
    while (this.active.size < settings().concurrency) {
      const job = claimJob(this.owner);
      if (!job) break;
      const controller = new AbortController();
      const promise = executeJob(job, controller).finally(() => this.active.delete(job.id));
      this.active.set(job.id, { controller, promise });
    }
    syncRequests();
  }
  start() {
    this.tick();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e: any) {
        log('error', e.message);
      }
    }, 1500);
    log('info', 'Download worker started.');
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const a of this.active.values()) a.controller.abort();
    await Promise.all([...this.active.values()].map((a) => a.promise));
  }
}
