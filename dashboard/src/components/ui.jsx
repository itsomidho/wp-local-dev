import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, ArrowDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Layers: modals, drawers and the command palette stack (a confirm opened
// from inside the site drawer sits on top of it). Escape closes only the
// topmost one, and body scroll is locked while any is open.
// ---------------------------------------------------------------------------
const layerStack = [];

function useLayer(onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const token = {};
    layerStack.push(token);
    document.body.classList.add('has-layer');
    const onKey = (e) => {
      if (e.key === 'Escape' && layerStack[layerStack.length - 1] === token && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      layerStack.splice(layerStack.indexOf(token), 1);
      if (layerStack.length === 0) document.body.classList.remove('has-layer');
    };
  }, []);
}

// `onClose` null = not dismissable (e.g. while a streamed command runs):
// Escape and backdrop clicks do nothing.
export function Modal({ onClose, size = 'md', className = '', as: Tag = 'div', children, ...rest }) {
  useLayer(onClose);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <Tag className={`modal modal-${size} ${className}`} role="dialog" aria-modal="true" {...rest}>
        {children}
      </Tag>
    </div>,
    document.body,
  );
}

export function ModalHeader({ icon: Icon, title, subtitle, onClose, children }) {
  return (
    <div className="modal-header">
      {Icon && (
        <span className="modal-icon">
          <Icon size={18} strokeWidth={2} />
        </span>
      )}
      <div className="modal-heading">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
      {onClose && (
        <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Drawer({ onClose, children, className = '' }) {
  useLayer(onClose);
  return createPortal(
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className={`drawer ${className}`} role="dialog" aria-modal="true">
        {children}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Toasts -- quick, non-blocking feedback for one-shot actions (stack up,
// copy, link opened). Anything with real output still shows that output.
// ---------------------------------------------------------------------------
const ToastContext = createContext(() => {});

const TOAST_ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    ({ title, description, tone = 'info', duration = 4500 }) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { id, title, description, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => {
            const Icon = TOAST_ICON[t.tone];
            return (
              <div key={t.id} className={`toast toast-${t.tone}`}>
                <Icon size={18} className="toast-icon" />
                <div className="toast-body">
                  <strong>{t.title}</strong>
                  {t.description && <span>{t.description}</span>}
                </div>
                <button type="button" className="btn btn-icon btn-ghost btn-xs" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

// A stable two-stop gradient per site name, so each site keeps the same
// avatar color everywhere it appears.
export function Avatar({ name, size = 40 }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const words = name.split(/[-.]/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${(hue + 50) % 360} 75% 52%))`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function StatusDot({ tone = 'muted', pulse = false, label }) {
  return <span className={`dot dot-${tone}${pulse ? ' dot-pulse' : ''}`} title={label} aria-label={label} />;
}

export function Chip({ tone, mono, icon: Icon, children, title }) {
  return (
    <span className={`chip${tone ? ` chip-${tone}` : ''}${mono ? ' mono' : ''}`} title={title}>
      {Icon && <Icon size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

export function Skeleton({ width = '100%', height = 14, radius = 6 }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} />;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={22} />
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

export const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

// ---------------------------------------------------------------------------
// Following output as it arrives
// ---------------------------------------------------------------------------

const NEAR_BOTTOM_PX = 48;

// Keeps a scrolling box pinned to its bottom while new rows arrive (`dep`
// changes) -- but only while you're already at the bottom. Scroll up to
// read something and it stops following; `atBottom` goes false so the
// caller can offer a way back, and `scrollToBottom` resumes it.
export function useFollowOutput(dep, { enabled = true } = {}) {
  const ref = useRef(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      follow.current = near;
      setAtBottom(near);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (enabled && el && follow.current) el.scrollTop = el.scrollHeight;
  }, [dep, enabled]);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    follow.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  return { ref, atBottom, scrollToBottom };
}

// The same, for the page itself (the Doctor page grows as checks stream
// in): follows while `active` and you haven't scrolled away from the end.
export function useFollowPage(dep, active) {
  const follow = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      follow.current = doc.scrollHeight - window.scrollY - window.innerHeight < NEAR_BOTTOM_PX * 2;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (active && follow.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [dep, active]);
}

export function JumpToLatest({ onClick }) {
  return (
    <button type="button" className="jump-latest" onClick={onClick}>
      <ArrowDown size={14} /> Jump to latest
    </button>
  );
}

// Tab-separated output with a header row -- what WP-CLI prints for any
// list (`plugin list`, `user list`, ...) when it isn't attached to a
// terminal -- as {columns, rows}; null for anything else. Every line must
// have the header's column count, so prose that merely contains a tab
// stays text.
export function parseTsv(text) {
  const lines = (text || '').replace(/\n+$/, '').split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const columns = lines[0].split('\t');
  if (columns.length < 2 || columns.some((c) => !c.trim())) return null;
  const rows = lines.slice(1).map((l) => l.split('\t'));
  return rows.every((r) => r.length === columns.length) ? { columns, rows } : null;
}

const VALUE_TONE = {
  active: 'success',
  'active-network': 'success',
  'must-use': 'info',
  dropin: 'info',
  inactive: undefined,
  available: 'warning',
  on: 'success',
  off: undefined,
  parent: 'info',
};

function Cell({ column, value }) {
  if (value === '') return <span className="dim">—</span>;
  // Status-like columns get a chip; everything else stays a plain value.
  if (/^(status|update|auto_update)$/.test(column) && value in VALUE_TONE) {
    return <Chip tone={VALUE_TONE[value]}>{value}</Chip>;
  }
  return value;
}

function OutputTable({ table }) {
  return (
    <div className="output-table-wrap">
      <table className="data-table output-table">
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c}>{c.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className={j === 0 ? 'mono strong' : 'mono'}>
                  <Cell column={table.columns[j]} value={v} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A command's output appearing inside a panel (the site drawer's tabs):
// brought into view when it shows up or changes, since it usually lands
// below whatever button produced it. Tabular output is shown as a table,
// with the untouched text one click away.
export function Output({ children }) {
  const ref = useRef(null);
  const [raw, setRaw] = useState(false);
  const table = typeof children === 'string' ? parseTsv(children) : null;

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [children]);

  if (!table) {
    return (
      <pre ref={ref} className="terminal output">
        {children}
      </pre>
    );
  }
  return (
    <div ref={ref} className="output-block">
      <div className="output-block-head">
        <span className="muted small">
          {table.rows.length} row{table.rows.length === 1 ? '' : 's'}
        </span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRaw((v) => !v)}>
          {raw ? 'Table' : 'Raw output'}
        </button>
      </div>
      {raw ? <pre className="terminal output">{children}</pre> : <OutputTable table={table} />}
    </div>
  );
}
