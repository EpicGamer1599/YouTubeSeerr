import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { Settings } from './config.js';
import type { Media } from './youtube.js';
import { mediaUrl } from './youtube.js';
import { sanitizeFilename } from './files.js';
export interface Progress {
  percent: number;
  speed: number | null;
  eta: number | null;
  processing: boolean;
}
export function downloaderArgs(m: Media, s: Settings, staging: string) {
  const args = [
    '--ignore-config',
    '--no-playlist',
    '--no-simulate',
    '--newline',
    '--progress',
    '--progress-delta',
    '1',
    '--progress-template',
    'download:PROGRESS:%(progress)j',
    '--progress-template',
    'postprocess:PROCESSING:%(progress)j',
    '--print',
    'after_move:FILE:%(filepath)j',
    '--no-colors',
    '--windows-filenames',
    '--continue',
    '--retries',
    String(s.retries),
    '--fragment-retries',
    String(s.retries),
    '--socket-timeout',
    '30',
    '--js-runtimes',
    'node',
    '--no-remote-components',
    '--output',
    join(staging, sanitizeFilename(m.title, 75) + ' [' + m.id + '].%(ext)s'),
  ];
  if (s.outputMode === 'audio')
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', s.audioQuality, '--embed-metadata');
  else
    args.push(
      '-f',
      'bv*[height<=' + s.quality + ']+ba/b[height<=' + s.quality + ']',
      '--merge-output-format',
      'mkv',
      '--remux-video',
      'mkv',
    );
  if (s.writeMetadata) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
  if (process.env.FFMPEG_BIN) args.push('--ffmpeg-location', process.env.FFMPEG_BIN);
  if (s.rateLimit) args.push('--limit-rate', s.rateLimit);
  if (s.cookiesFile) args.push('--cookies', s.cookiesFile);
  args.push('--', mediaUrl('video', m.id));
  return args;
}
export async function download(
  m: Media,
  s: Settings,
  staging: string,
  onProgress: (p: Progress) => void,
  onLog: (line: string) => void,
  signal: AbortSignal,
): Promise<string> {
  return runDownloader(downloaderArgs(m, s, staging), onProgress, onLog, signal);
}
export async function runDownloader(
  args: string[],
  onProgress: (p: Progress) => void,
  onLog: (line: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error('Download cancelled.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YTDLP_BIN || 'yt-dlp', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let path = '',
      errorTail = '',
      done = false,
      forceTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      forceTimer.unref();
    };
    signal.addEventListener('abort', stop, { once: true });
    const timeout = setTimeout(stop, 24 * 3600000);
    timeout.unref();
    const line = (value: string) => {
      try {
        if (value.startsWith('PROGRESS:')) {
          const p = JSON.parse(value.slice(9)),
            total = p.total_bytes || p.total_bytes_estimate;
          onProgress({
            percent: total ? Math.min(100, (p.downloaded_bytes / total) * 100) : 0,
            speed: p.speed || null,
            eta: p.eta ?? null,
            processing: p.status === 'finished',
          });
        } else if (value.startsWith('PROCESSING:'))
          onProgress({ percent: 100, speed: null, eta: null, processing: true });
        else if (value.startsWith('FILE:')) path = JSON.parse(value.slice(5));
        else {
          errorTail = (errorTail + '\n' + value).slice(-6000);
          onLog(value);
        }
      } catch {
        onLog('Could not parse a yt-dlp progress message.');
      }
    };
    createInterface({ input: child.stdout }).on('line', line);
    createInterface({ input: child.stderr }).on('line', line);
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(forceTimer);
      signal.removeEventListener('abort', stop);
    };
    child.on('error', (e) => {
      done = true;
      cleanup();
      onLog(e.message);
      reject(new Error('Cannot start yt-dlp. Check YTDLP_BIN and the downloader installation.'));
    });
    child.on('close', (code) => {
      cleanup();
      if (done) return;
      if (signal.aborted) return reject(new Error('Download cancelled.'));
      if (code !== 0 || !path) {
        onLog(errorTail);
        return reject(
          new Error(
            'yt-dlp could not download this video. It may be unavailable, age-restricted, private, or require authentication. Check the download logs and cookie configuration.',
          ),
        );
      }
      resolve(path);
    });
  });
}
