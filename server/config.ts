import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { z } from 'zod';
import { all, one, run, transaction, configDir } from './db.js';

const keyFile = resolve(configDir, 'secret.key');
let encryptionKey: Buffer;
try {
  encryptionKey = readFileSync(keyFile);
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
  try {
    writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
  } catch (e: any) {
    if (e.code !== 'EEXIST') throw e;
  }
  encryptionKey = readFileSync(keyFile);
}
if (encryptionKey.length !== 32)
  throw new Error('secret.key must contain 32 bytes. Restore it from backup.');
export const jellyfinDeviceId = createHash('sha256')
  .update(encryptionKey)
  .update('YouTubeSeerr device')
  .digest('hex');
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return Buffer.concat([iv, data, c.getAuthTag()]).toString('base64');
}
export function decrypt(value: string) {
  const b = Buffer.from(value, 'base64');
  const c = createDecipheriv('aes-256-gcm', encryptionKey, b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString('utf8');
}
export function validServerUrl(value: string) {
  return z
    .string()
    .url()
    .refine((v) => {
      try {
        const u = new URL(v);
        return (
          ['http:', 'https:'].includes(u.protocol) &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          !['169.254.', '0.', '[fe80:', 'fe80:'].some((p) => u.hostname.toLowerCase().startsWith(p))
        );
      } catch {
        return false;
      }
    }, 'Enter an HTTP(S) Jellyfin URL without credentials or query parameters.')
    .transform((v) => new URL(v).toString().replace(/\/$/, ''))
    .parse(value);
}
const directory = z.string().min(1).max(500).refine(isAbsolute, 'Use an absolute directory path');
export const settingsSchema = z.object({
  appName: z.string().min(1).max(50),
  jellyfinUrl: z.string().transform(validServerUrl),
  jellyfinLibraryId: z
    .string()
    .regex(/^[a-fA-F0-9-]*$/)
    .max(64),
  downloadDir: directory,
  mediaDir: directory,
  outputMode: z.enum(['video', 'audio']),
  quality: z.enum(['2160', '1440', '1080', '720', '480']),
  audioQuality: z.enum(['0', '128K', '192K', '256K', '320K']),
  concurrency: z.number().int().min(1).max(6),
  retries: z.number().int().min(0).max(10),
  rateLimit: z.string().regex(/^(|\d+[KMG]?)$/),
  autoRefresh: z.boolean(),
  writeMetadata: z.boolean(),
  sessionHours: z.number().int().min(1).max(720),
  scanMinutes: z.number().int().min(15).max(1440),
  searchPerMinute: z.number().int().min(1).max(60),
  recentCount: z.number().int().min(1).max(100),
  maxCollectionItems: z.number().int().min(1).max(50000),
  region: z.string().regex(/^[A-Z]{2}$/),
  cookiesFile: z
    .string()
    .max(500)
    .refine((v) => !v || isAbsolute(v), 'Use an absolute cookie file path'),
  queuePaused: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
const defaults: Settings = {
  appName: 'YouTubeSeerr',
  jellyfinUrl: process.env.JELLYFIN_URL || 'http://localhost:8096',
  jellyfinLibraryId: '',
  downloadDir: resolve(process.env.DOWNLOAD_DIR || './downloads'),
  mediaDir: resolve(process.env.MEDIA_DIR || './media/youtube'),
  outputMode: 'video',
  quality: '1080',
  audioQuality: '0',
  concurrency: 2,
  retries: 3,
  rateLimit: '',
  autoRefresh: true,
  writeMetadata: true,
  sessionHours: 168,
  scanMinutes: 60,
  searchPerMinute: 12,
  recentCount: 20,
  maxCollectionItems: 5000,
  region: 'AU',
  cookiesFile: process.env.YTDLP_COOKIES_FILE || '',
  queuePaused: false,
};
export function settings(): Settings {
  const stored = Object.fromEntries(
    all("SELECT key,value FROM settings WHERE key NOT LIKE 'secret:%' AND key != 'configured'").map(
      (r) => [r.key, JSON.parse(r.value)],
    ),
  );
  return { ...defaults, ...stored };
}
export function configured() {
  return !!one('SELECT value FROM settings WHERE key=?', 'configured');
}
export function setValue(key: string, value: unknown) {
  run(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    JSON.stringify(value),
  );
}
export function saveSettings(value: Settings) {
  transaction(() => {
    for (const [k, v] of Object.entries(value)) setValue(k, v);
  });
}
export function secret(name: string) {
  const env = name === 'youtubeKey' ? process.env.YOUTUBE_API_KEY : process.env.JELLYFIN_API_KEY;
  if (env) return env;
  const row = one('SELECT value FROM settings WHERE key=?', 'secret:' + name);
  return row ? decrypt(JSON.parse(row.value)) : '';
}
export function setSecret(name: string, value: string) {
  if (value) setValue('secret:' + name, encrypt(value));
}
export function publicSettings() {
  return {
    ...settings(),
    hasYoutubeKey: !!secret('youtubeKey'),
    hasJellyfinToken: !!secret('jellyfinToken'),
  };
}
