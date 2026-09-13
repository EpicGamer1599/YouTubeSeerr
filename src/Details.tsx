import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  Download,
  Ban,
  Check,
  Users,
  CalendarDays,
  Clock3,
  Film,
  AlertTriangle,
} from 'lucide-react';
import { api, date, duration, type Media, type User } from './api';
import { Badge, ErrorMessage, Modal, Skeleton, useLoad, useConfirm } from './components';
export function Details({
  media,
  user,
  onClose,
  onChange,
}: {
  media: Media;
  user: User;
  onClose: () => void;
  onChange: () => void;
}) {
  const [rev, setRev] = useState(0),
    { data: m, error, loading } = useLoad<Media>('/media/' + media.type + '/' + media.id, rev);
  const [mode, setMode] = useState(
      media.type === 'video' ? 'video' : media.type === 'channel' ? 'recent' : 'all',
    ),
    [selected, setSelected] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  useEffect(() => {
    if (m?.requestMode) {
      setMode(m.requestMode);
      setSelected(m.selectedIds || []);
    }
  }, [m?.requestId, m?.requestMode]);
  const [items, setItems] = useState<Media[]>([]),
    [next, setNext] = useState<string | null>(null),
    [itemsBusy, setItemsBusy] = useState(false);
  async function loadItems(page = '') {
    setItemsBusy(true);
    try {
      const d = await api(
        '/media/' +
          media.type +
          '/' +
          media.id +
          '/items' +
          (page ? '?pageToken=' + encodeURIComponent(page) : ''),
      );
      setItems((old) => (page ? [...old, ...d.items] : d.items));
      setNext(d.nextPageToken);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setItemsBusy(false);
    }
  }
  useEffect(() => {
    if (media.type !== 'video') void loadItems();
  }, [media.id]);
  async function request(now = false) {
    setBusy(true);
    setActionError('');
    try {
      let id = m?.requestId;
      if (!id) {
        const r = await api('/requests', 'POST', {
          mediaId: media.id,
          type: media.type,
          mode,
          selectedIds: selected,
          confirmedAll: confirmed,
        });
        id = r.id;
      }
      if (now)
        await api('/requests/' + id + '/approve', 'POST', {
          confirmedAll: confirmed,
          mode,
          selectedIds: selected,
        });
      setRev((x) => x + 1);
      onChange();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const { confirm, confirmation } = useConfirm();
  async function cancel() {
    if (
      (await confirm({
        title: 'Cancel request?',
        description: 'Cancel “' + media.title + '”. Downloaded media is kept.',
        action: 'Cancel request',
        danger: true,
      })) === null
    )
      return;
    setBusy(true);
    try {
      await api('/requests/' + m?.requestId + '/cancel', 'POST');
      setRev((x) => x + 1);
      onChange();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canRequest = !m?.status || (m.status === 'PENDING' && user.isAdmin);
  const disabled =
    busy || (mode === 'all' && !confirmed) || (mode === 'selected' && !selected.length);
  const scopes =
    media.type === 'channel'
      ? [
          [
            'recent',
            'Recent videos',
            'Download the most recent videos, up to your server’s configured limit.',
          ],
          [
            'future',
            'Future uploads only',
            'Monitor this channel for videos published after this request.',
          ],
          [
            'all',
            'Entire available channel',
            'Download all public videos, up to the collection limit.',
          ],
        ]
      : [
          ['selected', 'Selected videos', 'Choose individual videos from the list below.'],
          [
            'new',
            'New additions only',
            'Record the current playlist, then download videos added after the first scan.',
          ],
          ['all', 'Entire playlist', 'Download every available video, up to the collection limit.'],
        ];
  return (
    <Modal
      title={
        media.type === 'video'
          ? 'Video details'
          : media.type === 'channel'
            ? 'Channel details'
            : 'Playlist details'
      }
      onClose={onClose}
      wide
    >
      {confirmation}
      {loading ? (
        <div className="modal-body">
          <Skeleton rows count={3} />
        </div>
      ) : error ? (
        <div className="modal-body">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      ) : (
        m && (
          <div className="detail-body">
            <div className="detail-overview">
              <div className={'detail-art ' + (m.type === 'channel' ? 'channel-art' : '')}>
                {(m.type === 'channel' ? m.thumbnail || m.avatar : m.thumbnail) ? (
                  <img src={m.thumbnail || m.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <Film size={48} />
                )}
                <span className="detail-type">{m.type}</span>
                {m.duration && <span className="duration">{duration(m.duration)}</span>}
              </div>
              <div className="detail-controls">
                <div className="detail-heading">
                  <div className="channel-byline">
                    {m.avatar && <img src={m.avatar} alt="" referrerPolicy="no-referrer" />}
                    <span>{m.channel}</span>
                  </div>
                  <h1>{m.title}</h1>
                  <div className="detail-meta">
                    {m.publishedAt && (
                      <span>
                        <CalendarDays size={15} />
                        {date(m.publishedAt)}
                      </span>
                    )}
                    {m.duration && (
                      <span>
                        <Clock3 size={15} />
                        {duration(m.duration)}
                      </span>
                    )}
                    {m.subscriberCount && (
                      <span>
                        <Users size={15} />
                        {Number(m.subscriberCount).toLocaleString()} subscribers
                      </span>
                    )}
                    {m.videoCount !== undefined && (
                      <span>{m.videoCount.toLocaleString()} videos</span>
                    )}
                  </div>
                  {m.status && (
                    <div className="detail-state" role="status">
                      <Badge status={m.status} monitoring={m.monitoring} />
                      <span>
                        {m.status === 'PENDING'
                          ? 'An administrator will review this request.'
                          : m.status === 'AVAILABLE'
                            ? m.monitoring
                              ? 'This collection is monitored for new videos.'
                              : 'Ready in your Jellyfin library.'
                            : m.status === 'QUEUED'
                              ? 'Waiting for the download worker.'
                              : 'Track this request on the requests page.'}
                      </span>
                    </div>
                  )}
                </div>
                <ErrorMessage>{actionError}</ErrorMessage>
                {canRequest && m.type !== 'video' && (
                  <fieldset className="scope-box">
                    <legend>Request scope</legend>
                    {scopes.map(([value, title, description]) => (
                      <label
                        className={'scope-option ' + (mode === value ? 'selected' : '')}
                        key={value}
                      >
                        <input
                          type="radio"
                          name="request-scope"
                          value={value}
                          checked={mode === value}
                          onChange={() => {
                            setMode(value);
                            setConfirmed(false);
                          }}
                        />
                        <span>
                          <strong>
                            {title}
                            {value === 'all' && <AlertTriangle size={14} />}
                          </strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {canRequest && mode === 'all' && (
                  <label className="check-label collection-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      <strong>
                        <AlertTriangle size={16} /> Confirm entire collection
                      </strong>
                      I confirm this may download the entire collection and use substantial storage.
                    </span>
                  </label>
                )}
                <div className="detail-actions">
                  {!m.status && (
                    <button className="primary" onClick={() => request()} disabled={disabled}>
                      <Plus size={17} />
                      {busy ? 'Requesting…' : 'Request ' + m.type}
                    </button>
                  )}
                  {user.isAdmin && canRequest && (
                    <button
                      className={m.status === 'PENDING' ? 'primary' : 'secondary'}
                      onClick={() => request(true)}
                      disabled={disabled}
                    >
                      <Download size={17} />
                      {busy ? 'Queuing…' : 'Download now'}
                    </button>
                  )}
                  {m.requestId && m.status === 'PENDING' && (
                    <button className="secondary" onClick={cancel} disabled={busy}>
                      <Ban size={16} />
                      Cancel request
                    </button>
                  )}
                </div>
                {canRequest && mode === 'selected' && (
                  <p className="selection-note">
                    {selected.length
                      ? selected.length + ' videos selected below.'
                      : 'Select at least one video below to continue.'}
                  </p>
                )}
                <a className="text-link" href={m.url} target="_blank" rel="noreferrer">
                  Open on YouTube <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
            <section className="detail-description">
              <h2>About this {m.type}</h2>
              <p className="description">{m.description || 'No description provided.'}</p>
            </section>
            {m.type !== 'video' && (
              <section className="collection">
                <div className="section-heading">
                  <h2>
                    {mode === 'selected'
                      ? 'Select videos'
                      : m.type === 'channel'
                        ? 'Recent uploads'
                        : 'In this playlist'}
                  </h2>
                  <span>
                    {mode === 'selected' ? selected.length + ' selected' : items.length + ' loaded'}
                  </span>
                </div>
                <div className="collection-list">
                  {items.map((v) => (
                    <div key={v.id} className="collection-row">
                      {mode === 'selected' && canRequest && (
                        <input
                          type="checkbox"
                          aria-label={'Select ' + v.title}
                          checked={selected.includes(v.id)}
                          onChange={(e) =>
                            setSelected((old) =>
                              e.target.checked ? [...old, v.id] : old.filter((id) => id !== v.id),
                            )
                          }
                        />
                      )}
                      <span className="collection-thumb">
                        {v.thumbnail ? (
                          <img src={v.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <Film size={22} />
                        )}
                      </span>
                      <div>
                        <a href={v.url} target="_blank" rel="noreferrer">
                          {v.title}
                        </a>
                        <span>
                          {v.channel}
                          {v.duration && ' · ' + duration(v.duration)}
                        </span>
                      </div>
                      <Badge status={v.status} />
                    </div>
                  ))}
                </div>
                {itemsBusy ? (
                  <Skeleton rows count={3} />
                ) : next ? (
                  <button className="secondary" onClick={() => loadItems(next)}>
                    Load more videos
                  </button>
                ) : items.length === 0 ? (
                  <p className="muted">No public videos found.</p>
                ) : null}
              </section>
            )}
          </div>
        )
      )}
    </Modal>
  );
}
