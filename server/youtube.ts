import { one, run } from './db.js';
import { secret, settings } from './config.js';
import { HttpError } from './jellyfin.js';
export type MediaType = 'video' | 'channel' | 'playlist';
export interface Media {
  id: string;
  type: MediaType;
  title: string;
  channel: string;
  channelId?: string;
  thumbnail: string;
  description: string;
  publishedAt?: string;
  duration?: string;
  liveBroadcast?: string;
  videoCount?: number;
  subscriberCount?: string;
  banner?: string;
  avatar?: string;
  uploadsId?: string;
  url: string;
}
export function validateId(type: string, id: string) {
  if (
    !(
      { video: /^[\w-]{11}$/, channel: /^UC[\w-]{22}$/, playlist: /^[\w-]{10,100}$/ } as Record<
        string,
        RegExp
      >
    )[type]?.test(id)
  )
    throw new HttpError(400, 'Invalid YouTube ' + type + ' ID.');
  return id;
}
export function mediaUrl(type: MediaType, id: string) {
  validateId(type, id);
  return type === 'video'
    ? 'https://www.youtube.com/watch?v=' + id
    : type === 'channel'
      ? 'https://www.youtube.com/channel/' + id
      : 'https://www.youtube.com/playlist?list=' + id;
}
export async function youtube(
  endpoint: string,
  params: Record<string, string>,
  apiKey = secret('youtubeKey'),
) {
  if (!apiKey) throw new HttpError(503, 'Add a YouTube Data API key in Settings to enable search.');
  let res: Response;
  try {
    res = await fetch(
      'https://www.googleapis.com/youtube/v3/' +
        endpoint +
        '?' +
        new URLSearchParams({ ...params, key: apiKey }),
      { signal: AbortSignal.timeout(20000), redirect: 'error' },
    );
  } catch {
    throw new HttpError(502, 'YouTube is unreachable. Please try again.');
  }
  const data = (await res.json()) as any;
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    throw new HttpError(
      502,
      reason === 'quotaExceeded'
        ? 'YouTube API quota is exhausted. Search will resume when Google resets the quota.'
        : reason === 'keyInvalid'
          ? 'The YouTube API key is invalid.'
          : 'YouTube could not complete the request. Check the API key, restrictions and quota.',
    );
  }
  return data;
}
function normalize(type: MediaType, item: any): Media {
  const s = item.snippet || {},
    t = s.thumbnails || {},
    id = item.id;
  return {
    id,
    type,
    title: s.title || 'Untitled',
    channel: s.channelTitle || s.title || 'Unknown channel',
    channelId: s.channelId,
    thumbnail: (t.maxres || t.high || t.medium || t.default)?.url || '',
    description: s.description || '',
    publishedAt: s.publishedAt,
    duration: item.contentDetails?.duration,
    liveBroadcast: s.liveBroadcastContent,
    videoCount: item.contentDetails?.itemCount,
    subscriberCount: item.statistics?.hiddenSubscriberCount
      ? undefined
      : item.statistics?.subscriberCount,
    banner: item.brandingSettings?.image?.bannerExternalUrl,
    avatar: type === 'channel' ? (t.high || t.default)?.url : undefined,
    uploadsId: item.contentDetails?.relatedPlaylists?.uploads,
    url: mediaUrl(type, id),
  };
}
export function cacheMedia(m: Media) {
  run(
    'INSERT INTO media VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,channel=excluded.channel,data=excluded.data,updated_at=excluded.updated_at',
    m.id,
    m.type,
    m.title,
    m.channel,
    JSON.stringify(m),
    Date.now(),
  );
  if (m.type === 'channel')
    run(
      'INSERT INTO channels VALUES(?,?) ON CONFLICT(media_id) DO UPDATE SET uploads_id=excluded.uploads_id',
      m.id,
      m.uploadsId || null,
    );
  if (m.type === 'playlist')
    run(
      'INSERT INTO playlists VALUES(?,?) ON CONFLICT(media_id) DO UPDATE SET video_count=excluded.video_count',
      m.id,
      m.videoCount || 0,
    );
  return m;
}
export async function details(type: MediaType, id: string, force = false): Promise<Media> {
  validateId(type, id);
  const cached = one('SELECT * FROM media WHERE id=? AND type=?', id, type);
  if (cached && !force && cached.updated_at > Date.now() - 900000) return JSON.parse(cached.data);
  const data = await youtube(
    type === 'video' ? 'videos' : type === 'channel' ? 'channels' : 'playlists',
    {
      part:
        type === 'channel'
          ? 'snippet,contentDetails,statistics,brandingSettings'
          : 'snippet,contentDetails',
      id,
    },
  );
  if (!data.items?.length)
    throw new HttpError(404, 'This YouTube item is private, deleted, or unavailable.');
  return cacheMedia(normalize(type, data.items[0]));
}
const searchCache = new Map<string, { at: number; value: any }>();
export async function search(q: string, type: MediaType | 'all', pageToken = '') {
  const key = JSON.stringify([q, type, pageToken, settings().region]);
  const hit = searchCache.get(key);
  if (hit && hit.at > Date.now() - 300000) return hit.value;
  const data = await youtube('search', {
    part: 'snippet',
    q,
    type: type === 'all' ? 'video,channel,playlist' : type,
    maxResults: '24',
    regionCode: settings().region,
    ...(pageToken ? { pageToken } : {}),
  });
  const items: Media[] = [];
  for (const t of ['video', 'channel', 'playlist'] as MediaType[]) {
    const ids = data.items.filter((x: any) => x.id[t + 'Id']).map((x: any) => x.id[t + 'Id']);
    if (!ids.length) continue;
    const resources = await youtube(
      t === 'video' ? 'videos' : t === 'channel' ? 'channels' : 'playlists',
      {
        id: ids.join(','),
        part:
          t === 'channel'
            ? 'snippet,contentDetails,statistics,brandingSettings'
            : 'snippet,contentDetails',
      },
    );
    resources.items.forEach((r: any) => items.push(cacheMedia(normalize(t, r))));
  }
  const order = data.items.map((x: any) => x.id.videoId || x.id.channelId || x.id.playlistId);
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const value = { items, nextPageToken: data.nextPageToken || null };
  if (searchCache.size > 200) searchCache.clear();
  searchCache.set(key, { at: Date.now(), value });
  return value;
}
export async function collectionPage(type: MediaType, id: string, pageToken = '') {
  const parent = await details(type, id);
  const playlistId = type === 'channel' ? parent.uploadsId : id;
  if (!playlistId) return { items: [] as Media[], nextPageToken: null };
  const data = await youtube('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: '50',
    ...(pageToken ? { pageToken } : {}),
  });
  const ids = data.items.map((x: any) => x.contentDetails.videoId).filter(Boolean);
  const resources = ids.length
    ? await youtube('videos', { part: 'snippet,contentDetails', id: ids.join(',') })
    : { items: [] };
  return {
    items: resources.items
      .filter((v: any) => !['live', 'upcoming'].includes(v.snippet?.liveBroadcastContent))
      .map((v: any) => cacheMedia(normalize('video', v))) as Media[],
    nextPageToken: data.nextPageToken || null,
  };
}
export async function resolveInput(value: string): Promise<Media> {
  if (/^[\w-]{11}$/.test(value)) return details('video', value);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new HttpError(400, 'Paste a YouTube video, channel or playlist URL.');
  }
  if (
    !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname) ||
    u.protocol !== 'https:'
  )
    throw new HttpError(400, 'Only HTTPS YouTube URLs are supported.');
  if (u.hostname === 'youtu.be') return details('video', u.pathname.slice(1));
  if (u.searchParams.get('list')) return details('playlist', u.searchParams.get('list')!);
  if (u.searchParams.get('v')) return details('video', u.searchParams.get('v')!);
  if (/^\/(shorts|live)\//.test(u.pathname)) return details('video', u.pathname.split('/')[2]);
  if (u.pathname.startsWith('/channel/')) return details('channel', u.pathname.split('/')[2]);
  if (u.pathname.startsWith('/@')) {
    const data = await youtube('channels', { part: 'id', forHandle: u.pathname.split('/')[1] });
    if (data.items?.[0]) return details('channel', data.items[0].id);
  }
  throw new HttpError(
    400,
    'This YouTube URL does not identify a supported video, channel or playlist.',
  );
}
