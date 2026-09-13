import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Link,
  Server,
  Folder,
  KeyRound,
  Radio,
  ShieldCheck,
  ClipboardCheck,
  ArrowUpRight,
} from 'lucide-react';
import { api, setCsrf, type User } from './api';
import { Brand, ErrorMessage, SaveButton, Spinner } from './components';
export function Login({ onLogin, setup = false }: { onLogin: (u: User) => void; setup?: boolean }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const d = await api('/auth/login', 'POST', {
        username: f.get('username'),
        password: f.get('password'),
      });
      setCsrf(d.csrf);
      onLogin(d.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-top">
        <Brand />
        <span>YouTube requests for Jellyfin</span>
      </div>
      <div className="login-layout">
        <form className="auth-card" onSubmit={submit}>
          <span className="form-icon">
            <KeyRound size={26} />
          </span>
          <h1>{setup ? 'Continue setup' : 'Welcome back'}</h1>
          <p>Sign in with your existing Jellyfin account.</p>
          <ErrorMessage>{error}</ErrorMessage>
          <label>
            Username
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <SaveButton busy={busy}>
            Sign in with Jellyfin <ArrowRight size={16} />
          </SaveButton>
          <div className="secure-note">
            <ShieldCheck size={16} />
            Your password is never stored here.
          </div>
        </form>
      </div>
      <footer className="auth-footer">YouTubeSeerr · Your self-hosted video collection</footer>
    </div>
  );
}
export function Setup({
  user,
  onLogin,
  onFinish,
}: {
  user: User | null;
  onLogin: (u: User) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(user ? 1 : 0),
    [s, setS] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState('');
  const [libs, setLibs] = useState<any[]>([]);
  useEffect(() => {
    if (user) {
      api('/settings')
        .then(setS)
        .catch((e) => setError(e.message));
      api('/jellyfin/libraries')
        .then(setLibs)
        .catch((e) => setError(e.message));
    }
  }, [user]);
  async function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const r = await api('/setup/connect', 'POST', {
        url,
        username: f.get('username'),
        password: f.get('password'),
      });
      setCsrf(r.csrf);
      onLogin(r.user);
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError('');
    try {
      const d = await api('/setup/test', 'POST', { url });
      setNotice('Connected to ' + d.name + ' · Jellyfin ' + d.version);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/setup/finish', 'POST', s);
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page setup-page">
      <div className="auth-top">
        <Brand />
        <span>FIRST-TIME SETUP</span>
      </div>
      <div className="setup-layout">
        <aside className="setup-intro">
          <h1>Set up your server</h1>
          <p>Connect your services and choose where your videos live.</p>
          <ol className="setup-steps">
            {[
              [Link, 'Jellyfin', 'Connect your server'],
              [KeyRound, 'YouTube', 'Search and metadata'],
              [Folder, 'Storage', 'Quality and library paths'],
              [ClipboardCheck, 'Review', 'Check your configuration'],
              [Check, 'Complete', 'Start requesting'],
            ].map(([Icon, title, description], i) => {
              const I = Icon as typeof Link;
              return (
                <li
                  key={i}
                  className={step === i ? 'current' : step > i ? 'done' : ''}
                  aria-current={step === i ? 'step' : undefined}
                >
                  <span>{step > i ? <Check size={18} /> : <I size={18} />}</span>
                  <div>
                    <strong>{String(title)}</strong>
                    <small>{String(description)}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
        <section className="setup-form auth-card">
          <span className="eyebrow">
            {step === 4 ? 'READY TO GO' : 'STEP ' + (step + 1) + ' OF 4'}
          </span>
          <h2>
            {
              [
                'Connect to Jellyfin',
                'Find your next request',
                'A home for your videos',
                'Review your setup',
                'You’re all set',
              ][step]
            }
          </h2>
          <p>
            {
              [
                'Sign in as a Jellyfin administrator to set up your server.',
                'Use the official YouTube Data API for search and metadata.',
                'Choose storage paths accessible to the download worker and Jellyfin.',
                'Check the details below before saving your configuration.',
                'Your server is configured. Sign in with Jellyfin to request and manage videos.',
              ][step]
            }
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          {notice && <div className="success">{notice}</div>}
          {step === 0 ? (
            <form onSubmit={connect}>
              <label>
                Jellyfin server URL
                <input
                  type="url"
                  placeholder="http://your-jellyfin-server:8096"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setNotice('');
                  }}
                  required
                />
              </label>
              <button type="button" className="secondary full" onClick={test} disabled={busy}>
                Test connection
              </button>
              <div className="form-divider" />
              <label>
                Administrator username
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete="current-password" />
              </label>
              <SaveButton busy={busy}>
                Connect & continue <ArrowRight size={17} />
              </SaveButton>
            </form>
          ) : !s ? (
            <Spinner />
          ) : step === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError('');
                setNotice('');
                setStep(2);
              }}
            >
              <label>
                YouTube Data API key
                <input
                  type="password"
                  autoComplete="new-password"
                  value={s.youtubeKey || ''}
                  onChange={(e) => setS({ ...s, youtubeKey: e.target.value })}
                  placeholder={s.hasYoutubeKey ? 'Key configured' : 'Enter your API key'}
                  required={!s.hasYoutubeKey}
                />
              </label>
              <p className="field-help">
                Enable YouTube Data API v3 in your Google Cloud project. Your key stays on this
                server.
              </p>
              <a
                className="text-link"
                href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Google Cloud Console <ArrowUpRight size={15} />
              </a>
              <label>
                Search region
                <input
                  value={s.region}
                  maxLength={2}
                  pattern="[A-Z]{2}"
                  onChange={(e) => setS({ ...s, region: e.target.value.toUpperCase() })}
                />
              </label>
              <button className="primary full">
                Continue <ArrowRight size={17} />
              </button>
            </form>
          ) : step === 2 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError('');
                setStep(3);
              }}
            >
              <div className="form-grid">
                <label>
                  Download staging directory
                  <input
                    value={s.downloadDir}
                    onChange={(e) => setS({ ...s, downloadDir: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Jellyfin media directory
                  <input
                    value={s.mediaDir}
                    onChange={(e) => setS({ ...s, mediaDir: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Video quality
                  <select
                    value={s.quality}
                    onChange={(e) => setS({ ...s, quality: e.target.value })}
                  >
                    {['2160', '1440', '1080', '720', '480'].map((q) => (
                      <option key={q} value={q}>
                        {q}p
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Concurrent downloads
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={s.concurrency}
                    onChange={(e) => setS({ ...s, concurrency: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                Jellyfin library
                <select
                  value={s.jellyfinLibraryId}
                  onChange={(e) => setS({ ...s, jellyfinLibraryId: e.target.value })}
                >
                  <option value="">Refresh all libraries</option>
                  {libs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-help">
                Add the mapped media folder to a Movies library in Jellyfin and enable NFO metadata.
                Videos are organized by channel.
              </p>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <SaveButton busy={busy}>
                  Review setup <ArrowRight size={17} />
                </SaveButton>
              </div>
            </form>
          ) : step === 3 ? (
            <form onSubmit={finish}>
              <dl className="setup-review">
                <div>
                  <dt>Jellyfin server</dt>
                  <dd>{s.jellyfinUrl || url}</dd>
                </div>
                <div>
                  <dt>Administrator</dt>
                  <dd>{user?.displayName}</dd>
                </div>
                <div>
                  <dt>YouTube API key</dt>
                  <dd>
                    <Check size={15} /> Configured · hidden
                  </dd>
                </div>
                <div>
                  <dt>Search region</dt>
                  <dd>{s.region}</dd>
                </div>
                <div>
                  <dt>Download staging</dt>
                  <dd>{s.downloadDir}</dd>
                </div>
                <div>
                  <dt>Jellyfin media</dt>
                  <dd>{s.mediaDir}</dd>
                </div>
                <div>
                  <dt>Video quality</dt>
                  <dd>{s.quality}p</dd>
                </div>
                <div>
                  <dt>Concurrent downloads</dt>
                  <dd>{s.concurrency}</dd>
                </div>
                <div>
                  <dt>Library refresh</dt>
                  <dd>{libs.find((l) => l.id === s.jellyfinLibraryId)?.name || 'All libraries'}</dd>
                </div>
              </dl>
              <div className="form-actions">
                <button className="secondary" type="button" onClick={() => setStep(2)}>
                  Back
                </button>
                <SaveButton busy={busy}>Finish setup</SaveButton>
              </div>
            </form>
          ) : (
            <div className="setup-complete">
              <div className="success">
                <Check size={18} /> Configuration saved successfully.
              </div>
              <button className="primary full" onClick={onFinish}>
                Open YouTubeSeerr <ArrowRight size={17} />
              </button>
            </div>
          )}
        </section>
      </div>
      <footer className="auth-footer">YouTubeSeerr · Server setup</footer>
    </div>
  );
}
