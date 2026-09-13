import { z } from 'zod';
import { all, one, run, transaction } from './db.js';
import { settings } from './config.js';
import { details } from './youtube.js';
import { HttpError } from './jellyfin.js';
export const requestSchema = z.object({
  mediaId: z.string(),
  type: z.enum(['video', 'channel', 'playlist']),
  mode: z.enum(['video', 'recent', 'all', 'future', 'new', 'selected']).default('video'),
  selectedIds: z
    .array(z.string().regex(/^[\w-]{11}$/))
    .max(500)
    .default([]),
  confirmedAll: z.boolean().default(false),
});
export function enqueue(kind: string, mediaId: string | null, requestId: number | null) {
  return run(
    'INSERT INTO jobs(kind,media_id,request_id,created_at,updated_at) VALUES(?,?,?,?,?)',
    kind,
    mediaId,
    requestId,
    Date.now(),
    Date.now(),
  );
}
export function addVideo(requestId: number, mediaId: string) {
  run('INSERT OR IGNORE INTO request_items VALUES(?,?)', requestId, mediaId);
  if (
    !one('SELECT media_id FROM downloads WHERE media_id=?', mediaId) &&
    !one(
      "SELECT id FROM jobs WHERE media_id=? AND kind='download' AND status IN ('QUEUED','DOWNLOADING','PROCESSING')",
      mediaId,
    )
  )
    enqueue('download', mediaId, null);
}
export async function createRequest(userId: string, input: unknown) {
  const b = requestSchema.parse(input);
  const allowed =
    b.type === 'video'
      ? ['video']
      : b.type === 'channel'
        ? ['recent', 'all', 'future']
        : ['all', 'new', 'selected'];
  if (!allowed.includes(b.mode)) throw new HttpError(400, 'Choose a supported download scope.');
  if (b.mode === 'selected' && !b.selectedIds.length)
    throw new HttpError(400, 'Select at least one video.');
  const m = await details(b.type, b.mediaId);
  if (['live', 'upcoming'].includes(m.liveBroadcast || ''))
    throw new HttpError(400, 'Live and upcoming streams can be requested after they finish.');
  return transaction(() => {
    if (
      one(
        "SELECT id FROM requests WHERE user_id=? AND media_id=? AND status NOT IN ('REJECTED','CANCELLED')",
        userId,
        m.id,
      )
    )
      throw new HttpError(409, 'You already requested this item.');
    const now = Date.now();
    const result = run(
      "INSERT INTO requests(user_id,media_id,status,mode,options,created_at,updated_at) VALUES(?,?,'PENDING',?,?,?,?)",
      userId,
      m.id,
      b.mode,
      JSON.stringify({
        selectedIds: b.selectedIds,
        confirmedAll: b.confirmedAll,
        recentCount: settings().recentCount,
      }),
      now,
      now,
    );
    return Number(result.lastInsertRowid);
  });
}
export function approve(id: number, adminId: string, confirmedAll = false, changes: unknown = {}) {
  const change = z
    .object({
      mode: z.enum(['video', 'recent', 'all', 'future', 'new', 'selected']).optional(),
      selectedIds: z
        .array(z.string().regex(/^[\w-]{11}$/))
        .max(500)
        .optional(),
    })
    .parse(changes);
  transaction(() => {
    const r = one('SELECT * FROM requests WHERE id=?', id);
    if (!r) throw new HttpError(404, 'Request not found.');
    if (r.status !== 'PENDING') throw new HttpError(409, 'Only pending requests can be approved.');
    const type = one('SELECT type FROM media WHERE id=?', r.media_id).type;
    const allowed =
      type === 'video'
        ? ['video']
        : type === 'channel'
          ? ['recent', 'all', 'future']
          : ['all', 'new', 'selected'];
    r.mode = change.mode || r.mode;
    if (!allowed.includes(r.mode)) throw new HttpError(400, 'Choose a supported download scope.');
    const opts = JSON.parse(r.options);
    if (change.selectedIds) opts.selectedIds = change.selectedIds;
    if (r.mode === 'selected' && !opts.selectedIds?.length)
      throw new HttpError(400, 'Select at least one video.');
    run('UPDATE requests SET mode=?,options=? WHERE id=?', r.mode, JSON.stringify(opts), id);
    if (r.mode === 'all' && !confirmedAll)
      throw new HttpError(400, 'Confirm downloading the entire collection before approving.');
    run(
      "UPDATE requests SET status='APPROVED',approved_by=?,monitoring=?,updated_at=? WHERE id=?",
      adminId,
      +['future', 'new'].includes(r.mode),
      Date.now(),
      id,
    );
    if (r.mode === 'video') addVideo(id, r.media_id);
    else enqueue('expand', r.media_id, id);
    run("UPDATE requests SET status='QUEUED' WHERE id=?", id);
  });
  syncRequests();
}
export function syncRequests() {
  for (const r of all(
    "SELECT * FROM requests WHERE status NOT IN ('PENDING','REJECTED','CANCELLED')",
  )) {
    const expanding = one(
      "SELECT status,error FROM jobs WHERE request_id=? AND kind='expand' ORDER BY id DESC LIMIT 1",
      r.id,
    );
    const items = all(
      "SELECT i.media_id,d.completed_at,(SELECT status FROM jobs j WHERE j.kind='download' AND j.media_id=i.media_id ORDER BY id DESC LIMIT 1) job_status FROM request_items i LEFT JOIN downloads d ON d.media_id=i.media_id WHERE request_id=?",
      r.id,
    );
    let status = 'AVAILABLE';
    if (expanding && ['QUEUED', 'DOWNLOADING', 'PROCESSING'].includes(expanding.status))
      status = expanding.status;
    else if (items.some((i) => !i.completed_at && i.job_status === 'DOWNLOADING'))
      status = 'DOWNLOADING';
    else if (items.some((i) => !i.completed_at && i.job_status === 'PROCESSING'))
      status = 'PROCESSING';
    else if (items.some((i) => !i.completed_at && i.job_status === 'QUEUED')) status = 'QUEUED';
    else if (
      ['FAILED', 'CANCELLED'].includes(expanding?.status) ||
      items.some((i) => !i.completed_at)
    )
      status = 'FAILED';
    run(
      'UPDATE requests SET status=?,error=?,updated_at=CASE WHEN status!=? THEN ? ELSE updated_at END WHERE id=?',
      status,
      status === 'FAILED'
        ? expanding?.error ||
            'One or more videos could not be downloaded. An administrator can review and retry the failed jobs.'
        : null,
      status,
      Date.now(),
      r.id,
    );
  }
}
export function requestList(user: any, status?: string, type?: string) {
  const rows = all(
    'SELECT r.*,m.data,u.display_name requester,a.display_name approver FROM requests r JOIN media m ON m.id=r.media_id JOIN users u ON u.id=r.user_id LEFT JOIN users a ON a.id=r.approved_by WHERE (?=1 OR r.user_id=?) AND (? IS NULL OR r.status=?) AND (? IS NULL OR m.type=?) ORDER BY r.created_at DESC LIMIT 500',
    +!!(user.jellyfin_admin || user.local_admin),
    user.id,
    status || null,
    status || null,
    type || null,
    type || null,
  );
  return rows.map((r) => ({
    ...r,
    media: JSON.parse(r.data),
    data: undefined,
    options: JSON.parse(r.options),
    items: one(
      'SELECT COUNT(*) total,SUM(CASE WHEN d.media_id IS NOT NULL THEN 1 ELSE 0 END) completed FROM request_items i LEFT JOIN downloads d ON d.media_id=i.media_id WHERE request_id=?',
      r.id,
    ),
  }));
}
export function mediaState(mediaId: string, user: any) {
  const available = !!one('SELECT media_id FROM downloads WHERE media_id=?', mediaId);
  const own = one(
    "SELECT id,status,monitoring,mode,options FROM requests WHERE media_id=? AND (user_id=? OR ?=1) AND status NOT IN ('REJECTED','CANCELLED') ORDER BY CASE WHEN user_id=? THEN 0 ELSE 1 END,id DESC LIMIT 1",
    mediaId,
    user.id,
    +!!(user.jellyfin_admin || user.local_admin),
    user.id,
  );
  return {
    status: available ? 'AVAILABLE' : own?.status || null,
    requestId: own?.id || null,
    monitoring: !!own?.monitoring,
    requestMode: own?.mode,
    selectedIds: own ? JSON.parse(own.options).selectedIds : [],
  };
}
export function cancelRequest(id: number, user: any) {
  transaction(() => {
    const r = one('SELECT * FROM requests WHERE id=?', id);
    if (!r) throw new HttpError(404, 'Request not found.');
    if (
      !user.jellyfin_admin &&
      !user.local_admin &&
      (r.user_id !== user.id || r.status !== 'PENDING')
    )
      throw new HttpError(403, 'You can only cancel your own pending requests.');
    if (['CANCELLED', 'REJECTED'].includes(r.status))
      throw new HttpError(409, 'This request is already closed.');
    run(
      "UPDATE requests SET status='CANCELLED',monitoring=0,updated_at=? WHERE id=?",
      Date.now(),
      id,
    );
    run(
      "UPDATE jobs SET status='CANCELLED',updated_at=? WHERE request_id=? AND status IN ('QUEUED','DOWNLOADING','PROCESSING')",
      Date.now(),
      id,
    );
    for (const item of all('SELECT media_id FROM request_items WHERE request_id=?', id)) {
      if (
        !one(
          "SELECT i.request_id FROM request_items i JOIN requests r ON r.id=i.request_id WHERE i.media_id=? AND r.status NOT IN ('CANCELLED','REJECTED')",
          item.media_id,
        )
      )
        run(
          "UPDATE jobs SET status='CANCELLED',updated_at=? WHERE media_id=? AND kind='download' AND status IN ('QUEUED','DOWNLOADING','PROCESSING')",
          Date.now(),
          item.media_id,
        );
    }
  });
}
