import {
  LayoutDashboard,
  Globe,
  Boxes,
  Stethoscope,
  BookOpen,
  Database,
  Mail,
  Container,
  Ship,
  ArrowUpRight,
  Settings,
  Sparkles,
} from 'lucide-react';
import { appVersion } from '../api';

export const PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sites', label: 'Sites', icon: Globe },
  { id: 'services', label: 'Services', icon: Boxes },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'doctor', label: 'Doctor', icon: Stethoscope },
  { id: 'docs', label: 'Docs', icon: BookOpen },
];

export const TOOLS = [
  { id: 'adminer', label: 'Adminer', icon: Database },
  { id: 'mailpit', label: 'Mailpit', icon: Mail },
  { id: 'portainer', label: 'Portainer', icon: Ship },
];

// A terminal prompt typing a "w" -- WordPress, driven from the command
// line, which is what wpdev is. Same mark as public/favicon.svg; keep
// the two in sync.
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 11.5 10.5 16l-4 4.5" strokeWidth="2.6" />
        <path d="M13 12.5l2.2 8 2.6-5.6 2.6 5.6 2.2-8" strokeWidth="2.4" />
      </g>
      <rect className="logo-cursor" x="24.6" y="18.4" width="3.6" height="2.6" rx="0.8" fill="#fff" />
    </svg>
  );
}

export default function Sidebar({ page, onNavigate, counts, onOpenTool, onOpenSettings, updateInfo, onUpdate, open, onDismiss }) {
  return (
    <>
      <div className={`sidebar-scrim${open ? ' is-open' : ''}`} onClick={onDismiss} />
      <aside className={`sidebar${open ? ' is-open' : ''}`}>
        <div className="brand">
          <Logo />
          <div className="brand-text">
            <strong>wpdev</strong>
            <span>local WordPress</span>
          </div>
        </div>

        <nav className="nav">
          <span className="nav-label">Workspace</span>
          {PAGES.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              className={`nav-item${page === id ? ' is-active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(id);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {counts?.[id] != null && <span className="nav-count">{counts[id]}</span>}
            </a>
          ))}

          <span className="nav-label">Tools</span>
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="nav-item" onClick={() => onOpenTool(id)}>
              <Icon size={17} />
              <span>{label}</span>
              <ArrowUpRight size={14} className="nav-external" />
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {updateInfo?.updateAvailable && (
            <button type="button" className="update-card" onClick={onUpdate} title={updateInfo.stdout?.trim()}>
              <Sparkles size={16} />
              <span>
                <strong>Update available</strong>
                <small>Pull, rebuild and restart</small>
              </span>
            </button>
          )}
          <div className="sidebar-meta">
            {appVersion() ? (
              <span className="version mono" title="git describe for this checkout">
                {appVersion()}
              </span>
            ) : (
              <span className="version mono">dev</span>
            )}
            <button type="button" className="btn btn-icon btn-ghost" onClick={onOpenSettings} title="Settings" aria-label="Settings">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
