import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, realpath, copyFile, rename, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename, extname, join } from 'node:path';
import type { Media } from './youtube.js';
export function sanitizeFilename(value: string, max = 80) {
  let s = Array.from(
    value
      .normalize('NFC')
      .replace(/[<>:"/\\|?*%\x00-\x1f\x7f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim(),
  )
    .slice(0, max)
    .join('');
  if (!s || s === '.' || s === '..') s = 'Untitled';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)) s = '_' + s;
  return s;
}
export function inside(root: string, path: string) {
  const rel = relative(resolve(root), resolve(path));
  if (
    rel === '..' ||
    rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
    isAbsolute(rel)
  )
    throw new Error('Path is outside the configured storage directory.');
  return resolve(path);
}
export async function safeDirectory(root: string, ...parts: string[]) {
  await mkdir(root, { recursive: true });
  const base = await realpath(root);
  let dir = base;
  for (const part of parts) {
    dir = inside(base, join(dir, part));
    await mkdir(dir, { recursive: true });
    dir = inside(base, await realpath(dir));
  }
  return dir;
}
const xml = (s: unknown) =>
  String(s ?? '')
    .replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
    )
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
export function nfo(m: Media) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<movie><title>' +
    xml(m.title) +
    '</title><originaltitle>' +
    xml(m.title) +
    '</originaltitle><plot>' +
    xml(m.description) +
    '</plot><studio>' +
    xml(m.channel) +
    '</studio><premiered>' +
    xml(m.publishedAt?.slice(0, 10)) +
    '</premiered><year>' +
    xml(m.publishedAt?.slice(0, 4)) +
    '</year><uniqueid type="youtube" default="true">' +
    xml(m.id) +
    '</uniqueid><website>' +
    xml(m.url) +
    '</website></movie>\n'
  );
}
export async function publishMedia(
  m: Media,
  source: string,
  stagingRoot: string,
  mediaRoot: string,
  metadata: boolean,
) {
  const realSource = inside(await realpath(stagingRoot), await realpath(source));
  if (!(await stat(realSource)).isFile() || !(await stat(realSource)).size)
    throw new Error('yt-dlp produced an empty media file.');
  if (
    !['.mkv', '.mp4', '.webm', '.m4a', '.mp3', '.opus', '.flac', '.ogg'].includes(
      extname(realSource),
    )
  )
    throw new Error('Unexpected media file format.');
  const folder = await safeDirectory(
    mediaRoot,
    sanitizeFilename(m.channel, 60) + ' [' + sanitizeFilename(m.channelId || 'channel', 26) + ']',
    sanitizeFilename(m.title, 75) + ' [' + m.id + ']',
  );
  const destination = inside(
    folder,
    join(folder, sanitizeFilename(m.title, 75) + ' [' + m.id + ']' + extname(realSource)),
  );
  const temp = destination + '.' + randomUUID() + '.incoming';
  await copyFile(realSource, temp, constants.COPYFILE_EXCL);
  await rename(temp, destination);
  if (metadata) {
    const nfoTemp = join(folder, 'movie.' + randomUUID() + '.incoming');
    await writeFile(nfoTemp, nfo(m), { encoding: 'utf8', flag: 'wx' });
    await rename(nfoTemp, join(folder, 'movie.nfo'));
    const thumbs = (await readdir(stagingRoot)).filter((f) => f.endsWith('.jpg'));
    if (thumbs[0]) {
      const posterTemp = join(folder, 'poster.' + randomUUID() + '.incoming');
      const thumbnail = inside(
        await realpath(stagingRoot),
        await realpath(join(stagingRoot, thumbs[0])),
      );
      await copyFile(thumbnail, posterTemp, constants.COPYFILE_EXCL);
      await rename(posterTemp, join(folder, 'poster.jpg'));
    }
  }
  return destination;
}
