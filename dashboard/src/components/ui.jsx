import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

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
