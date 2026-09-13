import { useState } from 'react';
import {
  RefreshCw,
  ShieldCheck,
  Server,
  Settings2,
  Youtube,
  Folder,
  KeyRound,
  ScrollText,
  Users,
  Film,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import { api, type User } from './api';
import { ErrorMessage, SaveButton, Skeleton, Spinner, useLoad, PageHeader } from './components';
export function Settings({ user, notify }: { user: User; notify: (s: string) => void }) {
  const [tab, setTab] = useState('General'),
    [revision, setRevision] = useState(0);
  const { data: initial, error, loading } = useLoad<any>('/settings', revision);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  const tabs = [
    ['General', Settings2],
    ['Jellyfin', Server],
    ['YouTube', Youtube],
    ['Downloader', Folder],
    ['Media', Film],
    ['Queue & worker', SlidersHorizontal],
    ['Advanced', Wrench],
    ['Authentication', KeyRound],
    ['Users', Users],
    ['Logs', ScrollText],
  ] as const;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage connections, downloads, and access to your server."
      >
        <span className="admin-pill">
          <ShieldCheck size={16} />
          Administrator
        </span>
      </PageHeader>
      <label className="settings-select">
        Settings section
        <select
          value={tab}
          onChange={(e) => {
            setTab(e.target.value);
            setFailure('');
          }}
        >
          {tabs.map(([name]) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? 'active' : ''}
              aria-pressed={tab === name}
              onClick={() => {
                setTab(name);
                setFailure('');
              }}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <section className="settings-panel">
          <ErrorMessage>{error || failure}</ErrorMessage>
          {loading ? (
            <Skeleton rows count={4} />
          ) : tab === 'Users' ? (
            <UserSettings user={user} notify={notify} />
          ) : tab === 'Logs' ? (
            <Logs />
          ) : (
            initial && (
              <SettingsForm
                key={revision}
                initial={initial}
                tab={tab}
                busy={busy}
                onSave={async (s) => {
                  setBusy(true);
                  setFailure('');
                  try {
                    await api('/settings', 'PUT', s);
                    notify('Settings saved.');
                    setRevision((x) => x + 1);
                  } catch (e) {
                    setFailure((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                notify={notify}
              />
            )
          )}
        </section>
      </div>
    </>
  );
}
function SettingsForm({
  initial,
  tab,
  busy,
  onSave,
  notify,
}: {
  initial: any;
  tab: string;
  busy: boolean;
  onSave: (s: any) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [s, setS] = useState(initial),
    [testBusy, setTestBusy] = useState(false),
    [error, setError] = useState(''),
    [libs, setLibs] = useState<any[]>([]);
  const change = (key: string, value: unknown) => setS((old: any) => ({ ...old, [key]: value }));
  const field = (
    name: string,
    key: string,
    type = 'text',
    hint?: string,
    min?: number,
    max?: number,
  ) => (
    <label className="setting-field">
      <span>
        {name}
        {hint && <small id={'hint-' + key}>{hint}</small>}
      </span>
      <input
        type={type}
        id={'setting-' + key}
        aria-describedby={hint ? 'hint-' + key : undefined}
        placeholder={
          type === 'password' && (key === 'youtubeKey' ? s.hasYoutubeKey : s.hasJellyfinToken)
            ? 'Configured — leave blank to keep'
            : undefined
        }
        value={s[key] ?? ''}
        onChange={(e) => change(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        min={min}
        max={max}
        autoComplete={type === 'password' ? 'new-password' : undefined}
      />
    </label>
  );
  const choice = (name: string, key: string, options: [string, string][]) => (
    <label className="setting-field">
      <span>{name}</span>
      <select value={s[key]} onChange={(e) => change(key, e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (name: string, key: string, hint?: string) => (
    <label className="toggle-row">
      <span>
        <strong>{name}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={!!s[key]}
        onChange={(e) => change(key, e.target.checked)}
      />
    </label>
  );
  async function test(kind: string) {
    setTestBusy(true);
    setError('');
    try {
      if (kind === 'libraries') setLibs(await api('/jellyfin/libraries'));
      else {
        const r = await api('/jellyfin/' + kind, 'POST');
        notify(r.message || 'Connected to ' + r.name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(s);
      }}
    >
      <div className="panel-heading">
        <h2>{tab}</h2>
        <p>
          {
            (
              {
                General: 'Application preferences and default quality.',
                Jellyfin: 'Authentication, library scanning, and metadata.',
                YouTube: 'Official search and metadata, with your own API key.',
                Downloader: 'Working files and the library location shared with Jellyfin.',
                Media: 'Choose the format and maximum quality for new downloads.',
                'Queue & worker': 'Control resource use, retries, and queue activity.',
                Advanced: 'Optional download authentication.',
                Authentication: 'Jellyfin identity and session security.',
              } as Record<string, string>
            )[tab]
          }
        </p>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="settings-fields">
        {tab === 'General' && (
          <>
            {field('Application name', 'appName')}
            {choice('Default video quality', 'quality', [
              ['2160', '2160p · 4K'],
              ['1440', '1440p'],
              ['1080', '1080p · Full HD'],
              ['720', '720p'],
              ['480', '480p'],
            ])}
          </>
        )}
        {tab === 'Jellyfin' && (
          <>
            {field('Server URL', 'jellyfinUrl', 'url')}
            {field(
              'Jellyfin API key',
              'jellyfinToken',
              'password',
              s.hasJellyfinToken
                ? 'A token is configured. Leave blank to keep it.'
                : 'Create a key in Jellyfin → Dashboard → API Keys.',
            )}
            {field('Library ID', 'jellyfinLibraryId', 'text', 'Leave blank to scan all libraries.')}
            <div className="inline-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => test('libraries')}
                disabled={testBusy}
              >
                Load saved server libraries
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => test('test')}
                disabled={testBusy}
              >
                Test saved connection
              </button>
            </div>
            {libs.length > 0 && (
              <label>
                Choose a library
                <select
                  value={s.jellyfinLibraryId}
                  onChange={(e) => change('jellyfinLibraryId', e.target.value)}
                >
                  <option value="">All libraries</option>
                  {libs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {toggle(
              'Refresh after downloads',
              'autoRefresh',
              'Queue a library scan after videos are placed in the library.',
            )}
            {toggle(
              'Write local metadata',
              'writeMetadata',
              'Create a Jellyfin NFO and poster for each video.',
            )}
            <button
              className="secondary"
              type="button"
              onClick={() => test('refresh')}
              disabled={testBusy}
            >
              <RefreshCw size={16} />
              Refresh library now
            </button>
          </>
        )}
        {tab === 'YouTube' && (
          <>
            {field(
              'YouTube Data API key',
              'youtubeKey',
              'password',
              s.hasYoutubeKey
                ? 'A key is configured. Leave blank to keep it.'
                : 'Enable YouTube Data API v3 in Google Cloud.',
            )}
            {field('Search region (two uppercase letters)', 'region')}
            {field(
              'Searches per user per minute',
              'searchPerMinute',
              'number',
              'Repeated searches are cached for five minutes.',
              1,
              60,
            )}
            {field(
              'Subscription scan interval (minutes)',
              'scanMinutes',
              'number',
              undefined,
              15,
              1440,
            )}
            {field(
              'Recent channel videos',
              'recentCount',
              'number',
              'Used for new recent-video requests.',
              1,
              100,
            )}
            {field(
              'Maximum videos per collection',
              'maxCollectionItems',
              'number',
              'A safety cap. Entire collections also require approval and explicit confirmation.',
              1,
              50000,
            )}
          </>
        )}
        {tab === 'Downloader' && (
          <>
            {field(
              'Download staging directory',
              'downloadDir',
              'text',
              'Absolute path available to the download worker.',
            )}
            {field(
              'Jellyfin media directory',
              'mediaDir',
              'text',
              'Map this folder into Jellyfin and add it to a Movies library.',
            )}
          </>
        )}
        {tab === 'Media' && (
          <>
            {choice('Download format', 'outputMode', [
              ['video', 'Video with audio'],
              ['audio', 'Audio only · MP3'],
            ])}
            {choice('Video quality', 'quality', [
              ['2160', '2160p'],
              ['1440', '1440p'],
              ['1080', '1080p'],
              ['720', '720p'],
              ['480', '480p'],
            ])}
            {choice('Audio quality', 'audioQuality', [
              ['0', 'Best'],
              ['128K', '128 kbps'],
              ['192K', '192 kbps'],
              ['256K', '256 kbps'],
              ['320K', '320 kbps'],
            ])}
          </>
        )}
        {tab === 'Queue & worker' && (
          <>
            <div className="form-grid">
              {field('Concurrent jobs', 'concurrency', 'number', undefined, 1, 6)}
              {field('Retries', 'retries', 'number', undefined, 0, 10)}
            </div>
            {field(
              'Per-download speed limit',
              'rateLimit',
              'text',
              'Examples: 4M or 800K. Leave blank for no limit.',
            )}
            {toggle(
              'Pause queue',
              'queuePaused',
              'Finish active jobs; hold queued downloads and subscription scans.',
            )}
          </>
        )}
        {tab === 'Advanced' && (
          <>
            {field(
              'yt-dlp cookies file',
              'cookiesFile',
              'text',
              'Optional absolute path to a mounted Netscape cookie file.',
            )}
          </>
        )}
        {tab === 'Authentication' && (
          <>
            {field(
              'Session lifetime (hours)',
              'sessionHours',
              'number',
              'Applies to new sessions. Active Jellyfin sessions are revalidated every five minutes.',
              1,
              720,
            )}
            <div className="info-box">
              <ShieldCheck size={22} />
              <div>
                <strong>Connected to Jellyfin</strong>
                <p>
                  Users sign in with existing Jellyfin accounts. Passwords are never stored. Session
                  and API tokens are encrypted on disk.
                </p>
                <p>
                  For HTTPS deployments, set COOKIE_SECURE=true and APP_ORIGIN in your environment.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="settings-save">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}
function UserSettings({ user, notify }: { user: User; notify: (s: string) => void }) {
  const [rev, setRev] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error: loadError } = useLoad<User[]>('/users', rev);
  async function update(u: User, key: 'localAdmin' | 'disabled') {
    setBusy(u.id);
    setError('');
    try {
      await api('/users/' + u.id, 'PATCH', {
        localAdmin: u.localAdmin,
        disabled: u.disabled,
        [key]: !u[key],
      });
      setRev((x) => x + 1);
      notify('Permissions updated. Existing sessions revoked.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="panel-heading">
        <h2>Users & permissions</h2>
        <p>Jellyfin users appear after their first sign-in.</p>
      </div>
      <ErrorMessage>{error || loadError}</ErrorMessage>
      {loading ? (
        <Spinner />
      ) : (
        <div className="user-list">
          {data?.map((u) => (
            <div className="user-row" key={u.id}>
              <span className="avatar">{u.displayName.slice(0, 1)}</span>
              <div>
                <strong>{u.displayName}</strong>
                <small>
                  {u.jellyfinAdmin
                    ? 'Jellyfin administrator'
                    : u.localAdmin
                      ? 'YouTubeSeerr administrator'
                      : 'Jellyfin user'}
                  {u.id === user.id ? ' · You' : ''}
                </small>
              </div>
              <div className="user-actions">
                <button
                  className="secondary"
                  disabled={u.id === user.id || u.jellyfinAdmin || busy === u.id}
                  onClick={() => update(u, 'localAdmin')}
                >
                  {u.localAdmin ? 'Remove admin' : 'Make admin'}
                </button>
                <button
                  className="secondary"
                  disabled={u.id === user.id || busy === u.id}
                  onClick={() => update(u, 'disabled')}
                >
                  {u.disabled ? 'Enable access' : 'Disable access'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function Logs() {
  const { data, error, loading } = useLoad<any[]>('/logs', 0, 5000),
    [filter, setFilter] = useState('all');
  return (
    <>
      <div className="panel-heading">
        <h2>Application & download logs</h2>
        <p>Most recent 300 events. Refreshes automatically.</p>
      </div>
      <label>
        Level
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All events</option>
          <option value="error">Errors</option>
          <option value="info">Information</option>
          <option value="debug">Download output</option>
        </select>
      </label>
      <ErrorMessage>{error}</ErrorMessage>
      {loading ? (
        <Spinner />
      ) : (
        <div className="logs">
          {data
            ?.filter((l) => filter === 'all' || l.level === filter)
            .map((l) => (
              <div key={l.id} className={'log-line ' + l.level}>
                <time>{new Date(l.created_at).toLocaleString()}</time>
                <span>
                  {l.level}
                  {l.job_id ? ' · Job #' + l.job_id : ''}
                </span>
                <p>{l.message}</p>
              </div>
            ))}
          {!data?.length && <p>No events recorded yet.</p>}
        </div>
      )}
    </>
  );
}
