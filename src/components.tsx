import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Play,
  Plus,
  Check,
  LoaderCircle,
  X,
  Search,
  Film,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { api, duration, date, statusLabel, type Media } from './api';
export function useLoad<T>(path: string, revision = 0, poll = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true,
      busy = false;
    setLoading(true);
    setData(null);
    setError('');
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const v = await api<T>(path);
        if (alive) {
          setData(v);
          setError('');
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        busy = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const id = poll ? window.setInterval(load, poll) : undefined;
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, revision, poll]);
  return { data, error, loading };
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <a className="brand" href="#/home" aria-label="YouTubeSeerr home">
      <span className="brand-mark">
        <Play size={small ? 18 : 22} fill="currentColor" />
      </span>
      {!small && (
        <span>
          YouTube<span className="brand-light">Seerr</span>
        </span>
      )}
    </a>
  );
}
export function Badge({ status, monitoring = false }: { status?: string; monitoring?: boolean }) {
  return status ? (
    <span className={'badge ' + status.toLowerCase()}>
      {monitoring && status === 'AVAILABLE' ? 'Monitoring' : statusLabel(status)}
    </span>
  ) : null;
}
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Skeleton({ rows = false, count = 6 }: { rows?: boolean; count?: number }) {
  return (
    <div
      className={rows ? 'skeleton-list' : 'media-grid'}
      role="status"
      aria-label="Loading content"
      aria-busy="true"
    >
      <span className="sr-only">Loading content…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className={'skeleton-item ' + (rows ? 'skeleton-row' : '')} key={i} aria-hidden="true">
          <div className="skeleton skeleton-image" />
          <div className="skeleton-copy">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line shorter" />
          </div>
        </div>
      ))}
    </div>
  );
}
type Confirmation = {
  title: string;
  description: string;
  action: string;
  largeScope?: boolean;
  reason?: boolean;
  danger?: boolean;
};
export function useConfirm() {
  const [pending, setPending] = useState<
    (Confirmation & { resolve: (value: string | null) => void }) | null
  >(null);
  const resolver = useRef<((value: string | null) => void) | null>(null);
  useEffect(() => () => resolver.current?.(null), []);
  const confirm = (options: Confirmation) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setPending({ ...options, resolve });
    });
  const finish = (value: string | null) => {
    pending?.resolve(value);
    resolver.current = null;
    setPending(null);
  };
  return {
    confirm,
    confirmation: pending ? <ConfirmationDialog {...pending} onFinish={finish} /> : null,
  };
}
function ConfirmationDialog({
  title,
  description,
  action,
  largeScope,
  reason,
  danger,
  onFinish,
}: Confirmation & { onFinish: (v: string | null) => void }) {
  const [checked, setChecked] = useState(false),
    [note, setNote] = useState('');
  return (
    <Modal title={title} onClose={() => onFinish(null)}>
      <form
        className="modal-body confirmation-body"
        onSubmit={(e) => {
          e.preventDefault();
          onFinish(note);
        }}
      >
        <h2>{title}</h2>
        <p>{description}</p>
        {largeScope && (
          <label className="check-label collection-confirm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              <strong>
                <AlertTriangle size={16} /> Entire collection
              </strong>
              I understand this may use substantial bandwidth and storage.
            </span>
          </label>
        )}
        {reason && (
          <label>
            Reason (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => onFinish(null)} autoFocus>
            Go back
          </button>
          <button
            className={danger ? 'danger-button' : 'primary'}
            disabled={largeScope && !checked}
          >
            {action}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Navigation({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 800px)').matches);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const query = matchMedia('(max-width: 800px)');
    const change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (mobile && open) {
      ref.current?.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    ref.current?.close();
  }, [open, mobile]);
  return mobile ? (
    <dialog
      ref={ref}
      className="sidebar mobile-navigation"
      aria-label="Navigation"
      onCancel={onClose}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          e.clientX > e.currentTarget.getBoundingClientRect().right
        )
          onClose();
      }}
    >
      <button className="icon-button nav-close" aria-label="Close navigation" onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  ) : (
    <aside className="sidebar">{children}</aside>
  );
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return children ? (
    <div className="error" role="alert">
      {children}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Film size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const parentDialog = opener?.closest('dialog');
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else if (parentDialog?.isConnected)
        parentDialog.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={labelId}
    >
      <div className="modal-top">
        <span id={labelId}>{title}</span>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Card({
  media,
  onOpen,
  onRequest,
}: {
  media: Media;
  onOpen: (m: Media) => void;
  onRequest?: (m: Media) => void;
}) {
  return (
    <article className={'media-card ' + (media.type === 'channel' ? 'channel-card' : '')}>
      <button
        className="card-image"
        onClick={() => onOpen(media)}
        aria-label={'View ' + media.title}
      >
        {media.thumbnail ? (
          <img src={media.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <Film size={38} />
        )}
        <span className="image-shade" />
        <span className="type-label">{media.type}</span>
        {duration(media.duration) && <span className="duration">{duration(media.duration)}</span>}
        <span className="card-open">
          <ChevronRight size={25} />
        </span>
      </button>
      <div className="card-content">
        <button className="card-title" onClick={() => onOpen(media)}>
          {media.title}
        </button>
        <p>{media.channel}</p>
        <div className="card-meta">
          <span>
            {media.type === 'video'
              ? date(media.publishedAt)
              : media.type === 'playlist'
                ? String(media.videoCount ?? '—') + ' videos'
                : media.subscriberCount
                  ? Intl.NumberFormat(undefined, { notation: 'compact' }).format(
                      Number(media.subscriberCount),
                    ) + ' subscribers'
                  : 'Channel'}
          </span>
        </div>
        <div className="card-footer">
          {media.status ? (
            <Badge status={media.status} monitoring={media.monitoring} />
          ) : (
            <button
              className="request-button"
              onClick={() => (onRequest ? onRequest(media) : onOpen(media))}
            >
              <Plus size={15} /> Request
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export function SearchBox({
  initial = '',
  onSearch,
  large = false,
}: {
  initial?: string;
  onSearch: (value: string) => void;
  large?: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <form
      className={'searchbox ' + (large ? 'large' : '')}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
    >
      <Search size={22} />
      <input
        aria-label="Search YouTube"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search YouTube or paste a link"
        required
        maxLength={200}
      />
      <button type="submit" aria-label="Search">
        <ChevronRight size={23} />
      </button>
    </form>
  );
}
export function Section({
  title,
  children,
  link,
}: {
  title: string;
  children: ReactNode;
  link?: string;
}) {
  return (
    <section className="media-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {link && (
          <a href={link}>
            View all <ChevronRight size={16} />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}
export function SaveButton({
  busy,
  children = 'Save changes',
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="primary" disabled={busy} type="submit">
      {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} {children}
    </button>
  );
}
