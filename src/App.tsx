import { useEffect, useRef, useState } from 'react';
import {
  Home,
  Search,
  Clapperboard,
  Download,
  Radio,
  ListVideo,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Plus,
  ArrowRight,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Pause,
  Play,
  Trash2,
  Clock3,
  Film,
  ShieldCheck,
} from 'lucide-react';
import { api, setCsrf, date, type User, type Media, type RequestItem, type Job } from './api';
import {
  Brand,
  Badge,
  Card,
  SearchBox,
  Section,
  Empty,
  ErrorMessage,
  Spinner,
  useLoad,
  PageHeader,
  Skeleton,
  Navigation,
  useConfirm,
} from './components';
import { Setup, Login } from './Setup';
import { Settings } from './Settings';
import { Details } from './Details';
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/home');
  useEffect(() => {
    const fn = () => setRoute(location.hash.slice(1) || '/home');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return route;
}
export default function App() {
  const [setup, setSetup] = useState<{
      configured: boolean;
      connected: boolean;
      appName: string;
    } | null>(null),
    [user, setUser] = useState<User | null>(null),
    [bootError, setBootError] = useState(''),
    [booting, setBooting] = useState(true),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState<Media | null>(null),
    [toast, setToast] = useState(''),
    [menu, setMenu] = useState(false),
    [profile, setProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profile) return;
    const click = (e: PointerEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfile(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfile(false);
        profileRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [profile]);
  const route = useRoute(),
    path = route.split('?')[0],
    query = new URLSearchParams(route.split('?')[1] || '');
  async function boot() {
    setBooting(true);
    setBootError('');
    try {
      const s = await api('/setup');
      setSetup(s);
      try {
        const a = await api('/auth/me');
        setCsrf(a.csrf);
        setUser(a.user);
      } catch {
        setUser(null);
      }
    } catch (e) {
      setBootError((e as Error).message);
    } finally {
      setBooting(false);
    }
  }
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setMenu(false);
    setProfile(false);
    window.scrollTo(0, 0);
  }, [route]);
  function search(value: string, type = 'all') {
    location.hash = '/search?q=' + encodeURIComponent(value) + '&type=' + type;
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      setUser(null);
      setCsrf('');
      setProfile(false);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  function changed() {
    setRevision((x) => x + 1);
  }
  if (booting)
    return (
      <div className="boot">
        <Brand />
        <Spinner label="Connecting to your server…" />
      </div>
    );
  if (bootError)
    return (
      <div className="boot">
        <Brand />
        <ErrorMessage>{bootError}</ErrorMessage>
        <button className="primary" onClick={boot}>
          Try again
        </button>
      </div>
    );
  if (!setup?.configured) {
    if (!user && setup?.connected) return <Login setup onLogin={setUser} />;
    return (
      <Setup
        user={user}
        onLogin={setUser}
        onFinish={() => {
          setSetup({ ...setup!, configured: true });
          location.hash = '/home';
        }}
      />
    );
  }
  if (!user) return <Login onLogin={setUser} />;
  const nav = [
    ['/home', 'Discover', Home],
    ['/search', 'Search', Search],
    ['/requests', user.isAdmin ? 'All requests' : 'My requests', Clapperboard],
    ['/downloads', 'Downloads', Download],
    ['/channels', 'Channels', Radio],
    ['/playlists', 'Playlists', ListVideo],
  ] as const;
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <Navigation open={menu} onClose={() => setMenu(false)}>
        <Brand />
        <div className="nav-label">LIBRARY</div>
        <nav aria-label="Main navigation">
          {nav.map(([href, label, Icon]) => (
            <a
              key={href}
              href={'#' + href}
              className={path === href ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <Icon size={20} />
              {label}
            </a>
          ))}
        </nav>
        {user.isAdmin && (
          <>
            <div className="nav-label manage-label">MANAGE</div>
            <nav aria-label="Administration">
              <a
                href="#/settings"
                className={path === '/settings' ? 'active' : ''}
                aria-current={path === '/settings' ? 'page' : undefined}
                onClick={() => setMenu(false)}
              >
                <SettingsIcon size={20} />
                Settings
              </a>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="library-note">
            <ShieldCheck size={16} />
            <span>Signed in with Jellyfin</span>
          </div>
          <span className="version">
            YouTubeSeerr <span>v1.0.0beta</span>
          </span>
        </div>
      </Navigation>
      <div className="app-content">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Menu size={23} />
          </button>
          <div className="topbar-search">
            <SearchBox onSearch={search} />
          </div>
          <div className="topbar-right">
            <span className="server-name">{setup.appName}</span>
            <div
              className="profile-container"
              ref={profileRef}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setProfile(false);
              }}
            >
              <button
                className="profile"
                aria-expanded={profile}
                aria-label={
                  user.displayName + (user.isAdmin ? ' Administrator' : ' Jellyfin member')
                }
                onClick={() => setProfile(!profile)}
              >
                <span className="avatar">
                  {user.avatar ? <img src={user.avatar} alt="" /> : user.displayName.slice(0, 1)}
                </span>
                <span>
                  {user.displayName}
                  <small>{user.isAdmin ? 'Administrator' : 'Jellyfin member'}</small>
                </span>
                <ChevronRight size={15} />
              </button>
              {profile && (
                <div className="profile-menu">
                  <strong>{user.username}</strong>
                  <span>Signed in with Jellyfin</span>
                  <button onClick={logout}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {path === '/home' ? (
            <HomePage user={user} revision={revision} onOpen={setDetail} onSearch={search} />
          ) : path === '/search' ? (
            <SearchPage
              key={route}
              q={query.get('q') || ''}
              type={query.get('type') || 'all'}
              revision={revision}
              onOpen={setDetail}
              onSearch={search}
            />
          ) : path === '/requests' ? (
            <RequestsPage
              key={route}
              user={user}
              revision={revision}
              onOpen={setDetail}
              onChange={changed}
              notify={setToast}
            />
          ) : path === '/downloads' ? (
            <DownloadsPage user={user} revision={revision} onChange={changed} notify={setToast} />
          ) : path === '/channels' || path === '/playlists' ? (
            <CollectionsPage
              type={path === '/channels' ? 'channel' : 'playlist'}
              revision={revision}
              onOpen={setDetail}
            />
          ) : path === '/settings' && user.isAdmin ? (
            <Settings user={user} notify={setToast} />
          ) : (
            <Empty
              title="Page not found"
              action={
                <a className="primary" href="#/home">
                  Back to Discover
                </a>
              }
            >
              This page isn’t available.
            </Empty>
          )}
        </main>
        <footer className="app-footer">
          YouTubeSeerr <span>YouTube requests for Jellyfin</span>
        </footer>
      </div>
      {detail && (
        <Details
          key={detail.id}
          media={detail}
          user={user}
          onClose={() => setDetail(null)}
          onChange={changed}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-label="Notification">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function HomePage({
  user,
  revision,
  onOpen,
  onSearch,
}: {
  user: User;
  revision: number;
  onOpen: (m: Media) => void;
  onSearch: (s: string, t?: string) => void;
}) {
  const { data, error, loading } = useLoad<RequestItem[]>('/requests', revision, 7000);
  const requests = data || [],
    added = requests.filter((r) => r.status === 'AVAILABLE' && !r.monitoring),
    pending = requests.filter((r) => r.status === 'PENDING'),
    active = requests
      .filter((r) => ['DOWNLOADING', 'PROCESSING', 'QUEUED'].includes(r.status))
      .sort(
        (a, b) =>
          ['DOWNLOADING', 'PROCESSING', 'QUEUED'].indexOf(a.status) -
          ['DOWNLOADING', 'PROCESSING', 'QUEUED'].indexOf(b.status),
      );
  return (
    <>
      <PageHeader
        title="Discover"
        description="Request videos, channels, and playlists for your Jellyfin library."
      >
        <a className="secondary" href="#/requests">
          <Clapperboard size={16} /> {user.isAdmin ? 'Manage requests' : 'My requests'}
        </a>
      </PageHeader>
      <div className="home-search">
        <SearchBox large onSearch={onSearch} />
        <span>Search by title, creator, or YouTube URL</span>
      </div>
      <div className="activity-summary" aria-label="Request overview">
        {[
          [pending.length, 'Pending approval', '#/requests?status=PENDING', Clock3],
          [active.length, 'In the queue', '#/downloads', Download],
          [added.length, 'Available', '#/requests?status=AVAILABLE', Check],
          [
            requests.filter((r) => r.monitoring).length,
            'Monitored collections',
            '#/requests',
            Radio,
          ],
        ].map(([count, label, href, Icon]) => {
          const I = Icon as typeof Clock3;
          return (
            <a href={String(href)} key={String(label)}>
              <I size={18} />
              <div>
                <strong>{loading ? '—' : String(count)}</strong>
                <span>{String(label)}</span>
              </div>
              <ChevronRight size={16} />
            </a>
          );
        })}
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {loading ? (
        <Skeleton />
      ) : requests.length === 0 ? (
        <Section title="Recent activity">
          <Empty
            title="Your first request starts here"
            action={
              <a className="primary" href="#/search">
                <Plus size={16} /> Find a video
              </a>
            }
          >
            Search YouTube above. Approved requests are downloaded and added to your Jellyfin
            library.
          </Empty>
        </Section>
      ) : (
        <>
          {(pending.length > 0 || active.length > 0) && (
            <div className="activity-columns">
              {[
                [
                  user.isAdmin ? 'Awaiting your approval' : 'Awaiting approval',
                  pending,
                  '#/requests?status=PENDING',
                ],
                ['Download activity', active, '#/downloads'],
              ].map(([title, rows, href]) => (
                <Section title={String(title)} link={String(href)} key={String(title)}>
                  {(rows as RequestItem[]).length ? (
                    <div className="activity-list">
                      {(rows as RequestItem[]).slice(0, 3).map((r) => (
                        <button className="activity-row" key={r.id} onClick={() => onOpen(r.media)}>
                          <span className="activity-thumb">
                            {r.media.thumbnail ? (
                              <img src={r.media.thumbnail} alt="" loading="lazy" />
                            ) : (
                              <Film size={20} />
                            )}
                          </span>
                          <span className="activity-copy">
                            <strong>{r.media.title}</strong>
                            <small>
                              {r.requester} · {r.media.channel}
                            </small>
                          </span>
                          <Badge status={r.status} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="quiet-empty">
                      {title === 'Download activity'
                        ? 'No downloads waiting. Approved requests appear here.'
                        : 'You’re up to date. No requests awaiting approval.'}
                    </p>
                  )}
                </Section>
              ))}
            </div>
          )}
          <Section title="Recently requested" link="#/requests">
            <div className="media-grid">
              {requests.slice(0, 6).map((r) => (
                <Card
                  key={r.id}
                  media={{ ...r.media, status: r.status, monitoring: r.monitoring }}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </Section>
          {added.length > 0 && (
            <Section title="Recently added to Jellyfin" link="#/requests?status=AVAILABLE">
              <div className="media-grid">
                {added.slice(0, 6).map((r) => (
                  <Card key={r.id} media={{ ...r.media, status: r.status }} onOpen={onOpen} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      <div className="collection-shortcuts">
        <a href="#/channels">
          <Radio size={18} />
          <span>
            Channels<small>Manage creators and future uploads</small>
          </span>
          <ChevronRight size={16} />
        </a>
        <a href="#/playlists">
          <ListVideo size={18} />
          <span>
            Playlists<small>Manage your requested collections</small>
          </span>
          <ChevronRight size={16} />
        </a>
      </div>
    </>
  );
}
function SearchPage({
  q,
  type,
  revision,
  onOpen,
  onSearch,
}: {
  q: string;
  type: string;
  revision: number;
  onOpen: (m: Media) => void;
  onSearch: (s: string, t?: string) => void;
}) {
  const [items, setItems] = useState<Media[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function load(page = '') {
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const d = await api(
        '/search?q=' +
          encodeURIComponent(q) +
          '&type=' +
          encodeURIComponent(type) +
          (page ? '&pageToken=' + encodeURIComponent(page) : ''),
      );
      setItems((old) => (page ? [...old, ...d.items] : d.items));
      setNext(d.nextPageToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [q, type, revision]);
  return (
    <>
      <PageHeader
        title="Search YouTube"
        description="Find a video, follow a creator, or request a collection."
      />
      <div className="search-page-box">
        <SearchBox initial={q} large onSearch={(value) => onSearch(value, type)} />
      </div>
      <div className="filter-tabs" aria-label="Media type">
        {[
          ['all', 'Everything'],
          ['video', 'Videos'],
          ['channel', 'Channels'],
          ['playlist', 'Playlists'],
        ].map(([t, label]) => (
          <button
            key={t}
            className={type === t ? 'active' : ''}
            aria-pressed={type === t}
            onClick={() => (q ? onSearch(q, t) : (location.hash = '/search?type=' + t))}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {q ? (
        <>
          <div className="section-heading">
            <h2>Results for “{q}”</h2>
            <span>{loading ? 'Searching…' : items.length + ' results loaded'}</span>
          </div>
          <div className="media-grid">
            {items.map((m) => (
              <Card key={m.id} media={m} onOpen={onOpen} />
            ))}
          </div>
          {loading ? (
            items.length === 0 ? (
              <Skeleton />
            ) : (
              <div className="load-more">
                <button className="secondary" disabled>
                  Updating results…
                </button>
              </div>
            )
          ) : !error && !items.length ? (
            <Empty title="No results found">
              Try another search or paste a direct YouTube link.
            </Empty>
          ) : null}
          {next && !loading && (
            <div className="load-more">
              <button className="secondary" onClick={() => load(next)}>
                Load more results
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty title="Find your next request">
          Search videos, channels, and playlists, or paste a YouTube link above.
        </Empty>
      )}
    </>
  );
}
function RequestsPage({
  user,
  revision,
  onOpen,
  onChange,
  notify,
}: {
  user: User;
  revision: number;
  onOpen: (m: Media) => void;
  onChange: () => void;
  notify: (s: string) => void;
}) {
  const [filter] = useState(
      () => new URLSearchParams(location.hash.split('?')[1]).get('status') || '',
    ),
    [busy, setBusy] = useState<number | null>(null),
    [error, setError] = useState('');
  const {
    data,
    error: loadError,
    loading,
  } = useLoad<RequestItem[]>('/requests' + (filter ? '?status=' + filter : ''), revision, 5000);
  const { confirm, confirmation } = useConfirm();
  async function action(r: RequestItem, name: string) {
    let body: { confirmedAll?: boolean; reason?: string } = {};
    if (name === 'approve' && r.mode === 'all') {
      if (
        (await confirm({
          title: 'Approve entire ' + r.media.type + '?',
          description: r.media.title,
          action: 'Approve collection',
          largeScope: true,
        })) === null
      )
        return;
      body = { confirmedAll: true };
    }
    if (
      name === 'cancel' &&
      (await confirm({
        title: 'Cancel request?',
        description:
          'Stop downloads and monitoring for “' + r.media.title + '”. Downloaded media is kept.',
        action: 'Cancel request',
        danger: true,
      })) === null
    )
      return;
    if (name === 'reject') {
      const reason = await confirm({
        title: 'Reject request?',
        description: r.media.title,
        action: 'Reject request',
        reason: true,
        danger: true,
      });
      if (reason === null) return;
      body = { reason };
    }
    setBusy(r.id);
    setError('');
    try {
      await api('/requests/' + r.id + '/' + name, 'POST', body);
      onChange();
      notify(
        name === 'approve'
          ? 'Request approved. Added to the download queue.'
          : name === 'reject'
            ? 'Request rejected.'
            : name === 'retry'
              ? 'Failed jobs queued for retry.'
              : 'Request cancelled.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      {confirmation}
      <PageHeader
        title={user.isAdmin ? 'All requests' : 'My requests'}
        description={
          user.isAdmin
            ? 'Review requests and track your library’s activity.'
            : 'Track your requests from approval to availability.'
        }
      >
        <a className="primary" href="#/search">
          <Plus size={17} /> New request
        </a>
      </PageHeader>
      <div className="filter-tabs scrolling">
        {[
          ['', 'All requests'],
          ['PENDING', 'Pending'],
          ['QUEUED', 'Queued'],
          ['APPROVED', 'Approved'],
          ['DOWNLOADING', 'Downloading'],
          ['PROCESSING', 'Processing'],
          ['AVAILABLE', 'Available'],
          ['FAILED', 'Failed'],
          ['REJECTED', 'Rejected'],
          ['CANCELLED', 'Cancelled'],
        ].map(([v, t]) => (
          <button
            key={v}
            className={filter === v ? 'active' : ''}
            aria-pressed={filter === v}
            onClick={() => {
              location.hash = '/requests' + (v ? '?status=' + v : '');
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorMessage>{error || loadError}</ErrorMessage>
      {loading ? (
        <Skeleton rows />
      ) : !data?.length ? (
        <Empty
          title="No requests here yet"
          action={
            <a className="secondary" href="#/search">
              Find something to request
            </a>
          }
        >
          Requests matching this view will appear here.
        </Empty>
      ) : (
        <div className="request-list">
          <div className="list-heading">
            <span>Media & request details</span>
            <span>Status & actions</span>
          </div>
          {data.map((r) => (
            <article className="request-row" key={r.id}>
              <button
                className="request-thumb"
                onClick={() => onOpen(r.media)}
                aria-label={'View ' + r.media.title}
              >
                {r.media.thumbnail ? (
                  <img src={r.media.thumbnail} alt="" loading="lazy" />
                ) : (
                  <Film size={24} />
                )}
              </button>
              <div className="request-info">
                <span className="eyebrow">
                  {r.media.type} ·{' '}
                  {r.mode === 'video'
                    ? 'Single video'
                    : r.mode === 'recent'
                      ? 'Recent ' + r.options.recentCount + ' videos'
                      : r.mode === 'all'
                        ? 'Entire collection'
                        : r.mode === 'selected'
                          ? r.options.selectedIds.length + ' selected videos'
                          : r.mode === 'future'
                            ? 'Future uploads'
                            : 'New additions'}
                </span>
                <button className="row-title" onClick={() => onOpen(r.media)}>
                  {r.media.title}
                </button>
                <p>{r.media.channel}</p>
                <div className="request-meta">
                  {user.isAdmin && (
                    <span>
                      Requested by <strong>{r.requester}</strong>
                    </span>
                  )}
                  <span>{date(r.created_at)}</span>
                  {r.approver && (
                    <span>
                      {r.status === 'REJECTED' ? 'Reviewed' : 'Approved'} by {r.approver}
                    </span>
                  )}
                  {r.items.total > 0 && (
                    <span>
                      {r.items.completed || 0}/{r.items.total} videos ready
                    </span>
                  )}
                </div>
                {r.error && (
                  <details className="error-details">
                    <summary>Request error</summary>
                    <p>{r.error}</p>
                  </details>
                )}
              </div>
              <div className="request-end">
                <Badge status={r.status} monitoring={r.monitoring} />
                <div className="row-actions">
                  {user.isAdmin && r.status === 'PENDING' && (
                    <>
                      <button
                        className="approve-button"
                        onClick={() => action(r, 'approve')}
                        disabled={busy === r.id}
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        className="secondary reject-button"
                        onClick={() => action(r, 'reject')}
                        aria-label={'Reject ' + r.media.title}
                        disabled={busy === r.id}
                      >
                        <X size={16} /> Reject
                      </button>
                    </>
                  )}
                  {user.isAdmin && r.status === 'FAILED' && (
                    <button
                      className="secondary"
                      onClick={() => action(r, 'retry')}
                      disabled={busy === r.id}
                    >
                      <RotateCcw size={15} />
                      Retry
                    </button>
                  )}
                  {!['REJECTED', 'CANCELLED'].includes(r.status) &&
                    (user.isAdmin || (r.user_id === user.id && r.status === 'PENDING')) && (
                      <button
                        className="text-button"
                        onClick={() => action(r, 'cancel')}
                        disabled={busy === r.id}
                      >
                        {r.monitoring ? 'Stop monitoring' : 'Cancel'}
                      </button>
                    )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function DownloadsPage({
  user,
  revision,
  onChange,
  notify,
}: {
  user: User;
  revision: number;
  onChange: () => void;
  notify: (s: string) => void;
}) {
  const { data, error, loading } = useLoad<{ jobs: Job[]; paused: boolean; workerOnline: boolean }>(
    '/downloads',
    revision,
    2000,
  );
  const [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false);
  const { confirm, confirmation } = useConfirm();
  const [view, setView] = useState('all');
  async function action(id: number, name: string) {
    if (
      (name === 'cancel' || name === 'delete') &&
      (await confirm({
        title: name === 'cancel' ? 'Cancel download?' : 'Remove from history?',
        description:
          name === 'cancel'
            ? 'This stops job #' + id + ' for all requests waiting for this video.'
            : 'Remove job #' + id + ' from download history. Downloaded media is kept.',
        action: name === 'cancel' ? 'Cancel download' : 'Remove from history',
        danger: true,
      })) === null
    )
      return;
    setBusy(true);
    setFailure('');
    try {
      await api(
        '/jobs/' + id + (name === 'delete' ? '' : '/' + name),
        name === 'delete' ? 'DELETE' : 'POST',
      );
      onChange();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pause() {
    setBusy(true);
    try {
      await api('/settings', 'PUT', { queuePaused: !data?.paused });
      onChange();
      notify(data?.paused ? 'Queue resumed.' : 'Queue paused. Active jobs will finish.');
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visibleJobs = (data?.jobs || []).filter(
    (j) =>
      view === 'all' ||
      (view === 'active'
        ? ['QUEUED', 'DOWNLOADING', 'PROCESSING'].includes(j.status)
        : !['QUEUED', 'DOWNLOADING', 'PROCESSING'].includes(j.status)),
  );
  return (
    <>
      {confirmation}
      <PageHeader title="Downloads" description="Live progress and download history.">
        {user.isAdmin && (
          <button className="secondary" onClick={pause} disabled={busy || !data}>
            {data?.paused ? <Play size={17} /> : <Pause size={17} />}{' '}
            {data?.paused ? 'Resume queue' : 'Pause queue'}
          </button>
        )}
      </PageHeader>
      <div className="queue-toolbar">
        <div className="filter-tabs" aria-label="Download view">
          {[
            ['all', 'All jobs'],
            ['active', 'Active'],
            ['history', 'History'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={view === value ? 'active' : ''}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <span className="queue-health">
            <span className={data.workerOnline ? 'online' : 'offline'} />
            {data.workerOnline ? 'Worker online' : 'Worker offline'} ·{' '}
            {data.paused ? 'Queue paused' : 'Queue running'}
          </span>
        )}
      </div>
      <ErrorMessage>{error || failure}</ErrorMessage>
      {data && !data.workerOnline && (
        <div className="warning">
          The download worker is offline. Start the worker service to process queued requests.
        </div>
      )}
      {data?.paused && (
        <div className="info-box">
          Queue paused. Active jobs continue; waiting jobs will resume when you’re ready.
        </div>
      )}
      {loading ? (
        <Skeleton rows count={4} />
      ) : !data?.jobs.length ? (
        <Empty title="All quiet in the queue">
          Approved requests will appear here with live download progress.
        </Empty>
      ) : (
        <div className="download-list">
          {visibleJobs.length === 0 && (
            <Empty title={view === 'history' ? 'No download history' : 'No active downloads'}>
              Jobs matching this view will appear here.
            </Empty>
          )}
          {visibleJobs.map((j) => (
            <article className="download-row" key={j.id}>
              <div className="download-image">
                {j.media?.thumbnail ? (
                  <img src={j.media.thumbnail} alt="" loading="lazy" />
                ) : (
                  <RefreshIcon />
                )}
              </div>
              <div className="download-info">
                <div className="download-title">
                  <h3>{j.media?.title || 'Jellyfin library refresh'}</h3>
                  <Badge status={j.status} />
                </div>
                <p>
                  {j.kind === 'expand'
                    ? 'Checking collection for videos'
                    : j.kind === 'refresh'
                      ? 'Library integration'
                      : j.media?.channel}
                </p>
                {['DOWNLOADING', 'PROCESSING', 'QUEUED'].includes(j.status) && (
                  <>
                    <progress value={j.progress} max={100} aria-label="Download progress" />
                    <div className="progress-info">
                      <strong>
                        {j.status === 'QUEUED'
                          ? 'Queue position ' + j.position
                          : j.status === 'PROCESSING'
                            ? 'Organizing media…'
                            : j.progress.toFixed(1) + '%'}
                      </strong>
                      <span>
                        {j.speed ? (j.speed / 1048576).toFixed(1) + ' MB/s' : ''}
                        {j.eta !== undefined && j.eta !== null
                          ? ' · ETA ' +
                            Math.floor(j.eta / 60) +
                            ':' +
                            String(Math.floor(j.eta % 60)).padStart(2, '0')
                          : ''}
                      </span>
                    </div>
                  </>
                )}
                {j.error && (
                  <details className="error-details">
                    <summary>Download failed — view details</summary>
                    <p>{j.error}</p>
                  </details>
                )}
                <small className="muted">
                  Job #{j.id} · {j.attempts} attempt{j.attempts === 1 ? '' : 's'}
                </small>
              </div>
              {user.isAdmin && (
                <div className="download-actions">
                  {['FAILED', 'CANCELLED'].includes(j.status) && (
                    <button
                      className="icon-button"
                      onClick={() => action(j.id, 'retry')}
                      disabled={busy}
                      aria-label={'Retry job ' + j.id}
                    >
                      <RotateCcw size={18} />
                    </button>
                  )}
                  {['QUEUED', 'DOWNLOADING', 'PROCESSING'].includes(j.status) && (
                    <button
                      className="icon-button"
                      onClick={() => action(j.id, 'cancel')}
                      disabled={busy}
                      aria-label={'Cancel job ' + j.id}
                    >
                      <X size={18} />
                    </button>
                  )}
                  {['AVAILABLE', 'CANCELLED'].includes(j.status) && (
                    <button
                      className="icon-button"
                      onClick={() => action(j.id, 'delete')}
                      disabled={busy}
                      aria-label={'Remove job ' + j.id}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function RefreshIcon() {
  return <RotateCcw size={26} />;
}
function CollectionsPage({
  type,
  revision,
  onOpen,
}: {
  type: 'channel' | 'playlist';
  revision: number;
  onOpen: (m: Media) => void;
}) {
  const { data, error, loading } = useLoad<RequestItem[]>('/requests?type=' + type, revision, 7000);
  return (
    <>
      <PageHeader
        title={type === 'channel' ? 'Channels' : 'Playlists'}
        description={
          type === 'channel'
            ? 'Requested creators, recent videos, and monitored uploads.'
            : 'Requested playlists and monitored additions.'
        }
      >
        <a className="primary" href={'#/search?type=' + type}>
          <Plus size={17} /> Find {type}s
        </a>
      </PageHeader>
      <ErrorMessage>{error}</ErrorMessage>
      {loading ? (
        <Skeleton />
      ) : !data?.length ? (
        <Empty
          title={type === 'channel' ? 'No channels requested' : 'No playlists requested'}
          action={
            <a className="secondary" href={'#/search?type=' + type}>
              Search {type}s <ArrowRight size={16} />
            </a>
          }
        >
          {type === 'channel'
            ? 'Request recent videos, a full channel, or future uploads.'
            : 'Request an entire playlist, select videos, or follow new additions.'}
        </Empty>
      ) : (
        <div className="media-grid">
          {data.map((r) => (
            <Card
              key={r.id}
              media={{ ...r.media, status: r.status, monitoring: r.monitoring }}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </>
  );
}
