import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

export const configDir = resolve(process.env.CONFIG_DIR || './config');
mkdirSync(configDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(configDir, 'youtubeseerr.db'));
chmodSync(resolve(configDir, 'youtubeseerr.db'), 0o600);
db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
export function all<T = any>(sql: string, ...args: any[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}
export function one<T = any>(sql: string, ...args: any[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}
export function run(sql: string, ...args: any[]) {
  return db.prepare(sql).run(...args);
}
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Append migrations; never rewrite an applied version.
const migrations = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL, jellyfin_admin INTEGER NOT NULL DEFAULT 0, local_admin INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, avatar_tag TEXT, created_at INTEGER NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL, checked_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE media (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('video','channel','playlist')), title TEXT NOT NULL, channel TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE channels (media_id TEXT PRIMARY KEY REFERENCES media(id), uploads_id TEXT);
CREATE TABLE playlists (media_id TEXT PRIMARY KEY REFERENCES media(id), video_count INTEGER);
CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), media_id TEXT NOT NULL REFERENCES media(id), status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','QUEUED','DOWNLOADING','PROCESSING','AVAILABLE','FAILED','CANCELLED')), mode TEXT NOT NULL, options TEXT NOT NULL, monitoring INTEGER NOT NULL DEFAULT 0, next_scan INTEGER, approved_by TEXT REFERENCES users(id), error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX active_request ON requests(user_id,media_id) WHERE status NOT IN ('REJECTED','CANCELLED');
CREATE TABLE request_items (request_id INTEGER NOT NULL REFERENCES requests(id), media_id TEXT NOT NULL REFERENCES media(id), PRIMARY KEY(request_id,media_id));
CREATE TABLE subscription_seen (request_id INTEGER NOT NULL REFERENCES requests(id), video_id TEXT NOT NULL, PRIMARY KEY(request_id,video_id));
CREATE TABLE downloads (media_id TEXT PRIMARY KEY REFERENCES media(id), path TEXT NOT NULL, completed_at INTEGER NOT NULL);
CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, media_id TEXT REFERENCES media(id), request_id INTEGER REFERENCES requests(id), status TEXT NOT NULL DEFAULT 'QUEUED', progress REAL NOT NULL DEFAULT 0, speed REAL, eta REAL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, lease_until INTEGER, lease_owner TEXT, available_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX active_download ON jobs(media_id) WHERE kind='download' AND status IN ('QUEUED','DOWNLOADING','PROCESSING');
CREATE UNIQUE INDEX active_expansion ON jobs(request_id) WHERE kind='expand' AND status IN ('QUEUED','DOWNLOADING','PROCESSING');
CREATE INDEX queue_claim ON jobs(status,available_at,id);
CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, message TEXT NOT NULL, job_id INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE heartbeats (name TEXT PRIMARY KEY, updated_at INTEGER NOT NULL);`,
];
export function migrate() {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  migrations.forEach((sql, i) => {
    if (!one('SELECT version FROM schema_migrations WHERE version=?', i + 1))
      transaction(() => {
        if (one('SELECT version FROM schema_migrations WHERE version=?', i + 1)) return;
        db.exec(sql);
        run('INSERT INTO schema_migrations VALUES (?,?)', i + 1, Date.now());
      });
  });
}
migrate();
export function log(level: string, message: string, jobId: number | null = null) {
  const sanitized = message
    .replace(/(key|token|password|authorization)([=: ]+)[^\s&]+/gi, '$1$2[redacted]')
    .slice(0, 4000);
  run(
    'INSERT INTO logs(level,message,job_id,created_at) VALUES(?,?,?,?)',
    level,
    sanitized,
    jobId,
    Date.now(),
  );
  console.log(JSON.stringify({ level, message: sanitized, jobId }));
}
