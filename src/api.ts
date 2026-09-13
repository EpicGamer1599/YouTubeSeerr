export type MediaType = 'video' | 'channel' | 'playlist';
export interface User {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  avatar: string | null;
  jellyfinAdmin: boolean;
  localAdmin: boolean;
  disabled: boolean;
}
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
  videoCount?: number;
  subscriberCount?: string;
  banner?: string;
  avatar?: string;
  url: string;
  status?: string;
  requestId?: number;
  monitoring?: boolean;
  requestMode?: string;
  selectedIds?: string[];
}
export interface RequestItem {
  id: number;
  user_id: string;
  status: string;
  mode: string;
  media: Media;
  requester: string;
  approver?: string;
  error?: string;
  monitoring: boolean;
  created_at: number;
  items: { total: number; completed: number };
  options: { selectedIds: string[]; recentCount: number };
}
export interface Job {
  id: number;
  kind: string;
  status: string;
  progress: number;
  speed?: number;
  eta?: number;
  error?: string;
  position?: number;
  attempts: number;
  media?: Media;
}
export let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!res.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
export function duration(iso?: string) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  return [
    m[1],
    m[1] ? String(m[2] || 0).padStart(2, '0') : m[2] || '0',
    String(m[3] || 0).padStart(2, '0'),
  ]
    .filter((v) => v !== undefined)
    .join(':');
}
export function date(value?: string | number) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
}
export const statusLabel = (s: string) =>
  ({
    PENDING: 'Pending approval',
    APPROVED: 'Approved',
    QUEUED: 'Queued',
    DOWNLOADING: 'Downloading',
    PROCESSING: 'Processing',
    AVAILABLE: 'Available',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  })[s] || s;
