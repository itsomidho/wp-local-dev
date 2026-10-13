import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  LayoutDashboard,
  Settings2,
  Database,
  Layers,
  FolderOpen,
  Code2,
  SquareTerminal,
  Folder,
  Copy,
  Share2,
} from 'lucide-react';
import { api, siteUrl } from '../api';
import { stripAnsi } from '../lib/parse';
import { Avatar, Chip, StatusDot, useToast } from './ui';

// Running shares (`wpdev share`) by domain, provided by App from its poll.
export const SharesContext = createContext({});

// The project's path on the host, from /api/settings -- asked once, shared
// by every card.
let projectDirRequest;
function useProjectDir() {
  const [dir, setDir] = useState(null);
  useEffect(() => {
    projectDirRequest ||= api.settings().then((s) => s.projectDir);
    projectDirRequest.then(setDir).catch(() => {
      projectDirRequest = null;
    });
  }, []);
  return dir;
}

// The last line wpdev printed, which for a failure is its ✗ message.
function lastLine(text) {
  return stripAnsi(text || '')
    .trim()
    .split('\n')
    .pop()
    .replace(/^✗\s*/, '');
}

// Open the site's folder: in VS Code (a vscode:// link, which the browser
// hands to VS Code), in the file manager (`wpdev open`, through the api),
// or copy its path for anything else.
function FolderMenu({ site }) {
  // Where the menu goes: under the button, right edges lined up, in the
  // page's own layer (a card clips anything that sticks out), kept inside
  // the window.
  const [open, setOpen] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const toast = useToast();
  const projectDir = useProjectDir();
  const path = projectDir ? `${projectDir}/sites/${site.name}` : null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(null);
    const onPointer = (e) => !menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target) && close();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(null);
    const r = buttonRef.current.getBoundingClientRect();
    const width = 220;
    setOpen({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      width,
    });
  };

  // The file manager, or with an editor (nvim) a terminal window running it.
  const openOnDesktop = (editor) => {
    setOpen(null);
    api
      .openFolder(site.name, editor)
      .then(() => toast({ tone: 'success', title: `Opened sites/${site.name}${editor ? ` in ${editor}` : ''}` }))
      .catch((e) =>
        toast({
          tone: 'error',
          title: "Couldn't open the folder",
          description: lastLine(e.data?.stdout) || e.message,
          duration: 8000,
        }),
      );
  };

  const copyPath = () => {
    setOpen(null);
    navigator.clipboard
      .writeText(path)
      .then(() => toast({ tone: 'success', title: 'Copied the path', description: path }))
      .catch(() =>
        toast({
          tone: 'error',
          title: 'Clipboard unavailable',
          description: path,
        }),
      );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-xs btn-icon site-card-folder"
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        aria-label="Project folder"
        onClick={toggle}
        title={path ? `Project folder: ${path}` : 'Project folder'}
      >
        <FolderOpen size={15} />
      </button>
      {open &&
        createPortal(
          <div className="menu" role="menu" ref={menuRef} style={open}>
            {path && (
              <a role="menuitem" className="menu-item" href={`vscode://file${path}`} onClick={() => setOpen(null)}>
                <Code2 size={15} /> Open in VS Code
              </a>
            )}
            <button type="button" role="menuitem" className="menu-item" onClick={() => openOnDesktop('nvim')}>
              <SquareTerminal size={15} /> Open in Neovim
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => openOnDesktop()}>
              <Folder size={15} /> Open in file manager
            </button>
            {path && (
              <button type="button" role="menuitem" className="menu-item" onClick={copyPath}>
                <Copy size={15} /> Copy path
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// Reachability from `wpdev status`'s HTTP column: what nginx answered for
// the site's front page. "down" (or an older wpdev's 000) means nothing
// answered at all.
export function httpTone(code) {
  if (!code) return { tone: 'muted', label: 'Not checked yet' };
  if (code === 'down' || code === '000') return { tone: 'danger', label: 'Unreachable (no response)' };
  if (code === 'timeout') return { tone: 'warning', label: 'Slow (no answer within 10s)' };
  if (/^[23]/.test(code)) return { tone: 'success', label: `Reachable (HTTP ${code})` };
  return { tone: 'warning', label: `HTTP ${code}` };
}

function has(value) {
  return value && value !== 'n/a';
}

export function SiteChips({ site, status }) {
  const php = status?.php || site.php;
  const share = useContext(SharesContext)[site.domain];
  return (
    <div className="chips">
      {share && (
        <Chip tone="success" icon={Share2} title={`Shared until ${new Date(share.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${share.publicUrl ? `, also at ${share.publicUrl}` : ''}`}>
          {share.publicUrl ? 'Shared publicly' : 'Shared'}
        </Chip>
      )}
      {php && (
        <Chip mono title="PHP version">
          PHP {php}
        </Chip>
      )}
      {has(status?.wp) && (
        <Chip mono title="WordPress core version">
          WP {status.wp}
        </Chip>
      )}
      {status?.database && (
        <Chip
          tone={{ OK: 'success', starting: 'warning' }[status.database] || 'danger'}
          icon={Database}
          title={status.database === 'starting' ? 'MySQL is still starting up' : 'Database check'}
        >
          {status.database === 'OK' ? 'DB' : `DB ${status.database}`}
        </Chip>
      )}
      {status?.cache === 'Connected' && (
        <Chip tone="info" icon={Layers} title="Redis object cache connected">
          Redis
        </Chip>
      )}
    </div>
  );
}

export default function SiteCard({ site, status, onManage }) {
  const url = siteUrl(site.domain);
  const reach = httpTone(status?.http);

  return (
    <article className="site-card">
      <header className="site-card-head">
        <Avatar name={site.name} size={42} />
        <div className="site-card-title">
          <a href={url} target="_blank" rel="noreferrer" className="site-domain">
            {site.domain}
          </a>
          <span className="site-note">
            <StatusDot tone={reach.tone} label={reach.label} />
            {reach.tone === 'muted' ? site.note : reach.label}
          </span>
        </div>
        <div className="site-card-tools">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            onClick={() => onManage(site, 'Share')}
            title="Share with other devices"
            aria-label={`Share ${site.domain} with other devices`}
          >
            <Share2 size={15} />
          </button>
          <FolderMenu site={site} />
        </div>
      </header>

      <SiteChips site={site} status={status} />

      <footer className="site-card-actions">
        <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">
          <ArrowUpRight size={15} /> Visit
        </a>
        <a className="btn btn-ghost btn-sm" href={`${url}/wp-admin/`} target="_blank" rel="noreferrer">
          <LayoutDashboard size={15} /> Admin
        </a>
        <button type="button" className="btn btn-soft btn-sm site-card-manage" onClick={() => onManage(site)}>
          <Settings2 size={15} /> Manage
        </button>
      </footer>
    </article>
  );
}
