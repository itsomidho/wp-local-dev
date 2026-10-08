import { useEffect, useState } from 'react';
import {
  Info,
  Gauge,
  Image,
  ShieldCheck,
  Camera,
  Copy,
  Copy as CopyIcon,
  SquareTerminal,
  Trash2,
  ArrowUpRight,
  LayoutDashboard,
  X,
  Eye,
  EyeOff,
  Lock,
  Wrench,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { api, siteUrl } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { Avatar, Chip, Drawer, Skeleton, useToast } from './ui';
import { stripAnsi } from '../lib/parse';

const TABS = [
  { id: 'Overview', icon: Info },
  { id: 'Cache', icon: Gauge },
  { id: 'Media', icon: Image },
  { id: 'Admin domain', icon: ShieldCheck },
  { id: 'Snapshots', icon: Camera },
  { id: 'Clone', icon: Copy },
  { id: 'WP-CLI', icon: SquareTerminal },
  { id: 'Remove', icon: Trash2, danger: true },
];

export default function SiteManageDialog({ site, onClose, onRunAction, onRemoved }) {
  const [tab, setTab] = useState('Overview');
  const url = siteUrl(site.domain);

  return (
    <Drawer onClose={onClose} className="site-drawer">
      <div className="drawer-hero">
        <Avatar name={site.name} size={48} />
        <div className="drawer-hero-text">
          <h2 className="mono">{site.domain}</h2>
          <div className="drawer-hero-links">
            <a href={url} target="_blank" rel="noreferrer">
              <ArrowUpRight size={14} /> Visit site
            </a>
            <a href={`${url}/wp-admin/`} target="_blank" rel="noreferrer">
              <LayoutDashboard size={14} /> wp-admin
            </a>
            {site.php && <Chip mono>PHP {site.php}</Chip>}
          </div>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <nav className="drawer-tabs" role="tablist">
        {TABS.map(({ id, icon: Icon, danger }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === tab}
            className={`drawer-tab${id === tab ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            <span>{id}</span>
          </button>
        ))}
      </nav>
      <div className="drawer-body" key={tab}>
        {tab === 'Overview' && <OverviewTab site={site} />}
        {tab === 'Cache' && <CacheTab site={site} />}
        {tab === 'Media' && <MediaTab site={site} />}
        {tab === 'Admin domain' && <AdminDomainTab site={site} />}
        {tab === 'Snapshots' && <SnapshotsTab site={site} onRunAction={onRunAction} />}
        {tab === 'Clone' && <CloneTab site={site} onRunAction={onRunAction} />}
        {tab === 'WP-CLI' && <WpCliTab site={site} />}
        {tab === 'Remove' && <RemoveTab site={site} onRunAction={onRunAction} onRemoved={onRemoved} />}
      </div>
    </Drawer>
  );
}

// `wpdev creds <site>` prints "  Label:  value" lines, where a login is
// "user / secret". Rendered as rows with the secret masked until asked
// for, plus copy buttons -- the raw text is still what's shown, just laid
// out.
export function parseCreds(stdout) {
  return stripAnsi(stdout)
    .split('\n')
    .map((line) => /^\s{2}([^:()]+):\s+(.+)$/.exec(line))
    .filter(Boolean)
    .map(([, label, value]) => {
      const login = /^(\S+)\s+\/\s+(\S+)$/.exec(value.trim());
      return login ? { label, user: login[1], secret: login[2] } : { label, value: value.trim() };
    });
}

function CopyButton({ text, label }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost btn-xs"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => toast({ tone: 'success', title: `Copied ${label}` }))
          .catch(() => toast({ tone: 'error', title: 'Clipboard unavailable', description: 'The browser blocked clipboard access.' }))
      }
    >
      <CopyIcon size={13} />
    </button>
  );
}

function Secret({ value, label }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="secret">
      <code className="mono">{shown ? value : '•'.repeat(12)}</code>
      <button type="button" className="btn btn-icon btn-ghost btn-xs" onClick={() => setShown((v) => !v)} aria-label={shown ? `Hide ${label}` : `Show ${label}`}>
        {shown ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <CopyButton text={value} label={label} />
    </span>
  );
}

function OverviewTab({ site }) {
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmCert, setConfirmCert] = useState(false);

  const runTool = async (call) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await call();
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.data?.stdout || e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api
      .creds(site.name)
      .then((r) => setCreds(r.stdout))
      .catch((e) => setError(e.message));
  }, [site.name]);

  const rows = creds ? parseCreds(creds) : [];
  const savedIn = creds && /\(saved in ([^)]+)\)/.exec(stripAnsi(creds));

  return (
    <div className="tab-panel">
      <section className="panel-section">
        <h4>Credentials</h4>
        {error && <p className="error">{error}</p>}
        {!creds && !error && <Skeleton height={96} radius={12} />}
        {creds && rows.length === 0 && <pre className="terminal output">{creds}</pre>}
        {rows.length > 0 && (
          <dl className="kv">
            {rows.map((row) => (
              <div className="kv-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  {row.secret ? (
                    <>
                      <span className="kv-user">
                        <code className="mono">{row.user}</code>
                        <CopyButton text={row.user} label={`${row.label} user`} />
                      </span>
                      <Secret value={row.secret} label={`${row.label} password`} />
                    </>
                  ) : (
                    <code className="mono">{row.value}</code>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {savedIn && (
          <p className="muted small">
            Saved in <code>{savedIn[1]}</code>
          </p>
        )}
      </section>

      <section className="panel-section">
        <h4>Maintenance</h4>
        <div className="action-list">
          <button type="button" className="action-item" disabled={busy} onClick={() => setConfirmCert(true)}>
            <span className="action-item-icon">
              <Lock size={16} />
            </span>
            <span className="action-item-text">
              <strong>Reissue HTTPS certificate</strong>
              <small>When the browser shows a certificate warning, or Doctor flags the cert</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="action-item" disabled={busy} onClick={() => runTool(() => api.fixPerms(site.name))}>
            <span className="action-item-icon">
              <Wrench size={16} />
            </span>
            <span className="action-item-text">
              <strong>Fix file permissions</strong>
              <small>Make every file yours and writable again, e.g. after copying a site in</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
        {busy && <Skeleton height={60} radius={10} />}
        {result && <pre className="terminal output">{result}</pre>}
      </section>

      {confirmCert && (
        <ConfirmDialog
          title="Reissue this site's certificate?"
          message={`Replaces ${site.domain}'s certificate with a new one from the current mkcert CA and reloads nginx. Use it when Doctor flags the cert, or the browser shows a certificate warning.`}
          confirmLabel="Reissue"
          onCancel={() => setConfirmCert(false)}
          onConfirm={() => {
            setConfirmCert(false);
            runTool(() => api.cert(site.name));
          }}
        />
      )}
    </div>
  );
}

function CacheTab({ site }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const toggle = async (mode) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.cache(site.name, mode);
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.data?.stdout || e.data?.stderr || e.message);
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    setConfirmPurge(false);
    setBusy(true);
    setResult(null);
    try {
      const r = await api.cachePurge();
      setResult(r.stdout);
    } catch (e) {
      setResult(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tab-panel">
      <p className="muted">
        Full-page nginx cache for this site. Purge clears the cache shared by
        every site that has it enabled.
      </p>
      <div className="button-row">
        <button className="btn btn-primary" disabled={busy} onClick={() => toggle('on')}>
          Turn on
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => toggle('off')}>
          Turn off
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmPurge(true)}>
          Purge cache
        </button>
      </div>
      {result && <pre className="terminal output">{result}</pre>}
      {confirmPurge && (
        <ConfirmDialog
          title="Purge the full-page cache?"
          message="Clears cached pages for every site that has caching enabled, not just this one."
          onCancel={() => setConfirmPurge(false)}
          onConfirm={purge}
        />
      )}
    </div>
  );
}

// `wpdev media-proxy <site>` prints one status line; these are its formats
// (kept stable in wpdev for exactly this):
//   On: https://site.test/wp-content/uploads/…  →  https://prod.example/path/wp-content/uploads/…
//   Off (last production URL: https://prod.example/path)
//   Off
// `production` is the site URL (what the input takes), `remote` the
// uploads URL it maps to.
export function parseMediaProxy(stdout) {
  const text = (stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
  const on = /On:\s+(\S+?)\/…\s+→\s+(\S+?)\/…/.exec(text);
  if (on) {
    return {
      on: true,
      local: on[1],
      remote: on[2],
      production: on[2].replace(/\/wp-content\/uploads$/, ''),
    };
  }
  const off = /Off \(last production URL: ([^)\s]+)\)/.exec(text);
  return { on: false, local: null, remote: null, production: off ? off[1] : '' };
}

function MediaTab({ site }) {
  const [status, setStatus] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = () =>
    api
      .mediaProxyStatus(site.name)
      .then((r) => {
        const s = parseMediaProxy(r.stdout);
        setStatus(s);
        setUrl((current) => current || s.production);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const run = async (body) => {
    setConfirmOff(false);
    setBusy(true);
    setResult(null);
    try {
      const r = await api.mediaProxy(site.name, body);
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.data?.stdout || e.data?.stderr || e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <div className="tab-panel">
      <p className="muted">
        For a local copy without production's uploads folder. When on, any file under{' '}
        <code>/wp-content/uploads/</code> that's missing locally is streamed from the same path on
        production, through this site, so images load without a plugin, and no matter how this
        machine resolves production (e.g. an /etc/hosts entry for production wp-admin). Local
        files still win. Nothing is downloaded or stored.
      </p>
      {error && <p className="error">{error}</p>}
      {status && (
        <p className="status-line">
          <span className={status.on ? 'chip chip-success' : 'chip'}>
            {status.on ? 'On' : 'Off'}
          </span>{' '}
          {status.on
            ? `missing ${status.local}/… → ${status.remote}/…`
            : 'Uploads missing locally are 404s.'}
        </p>
      )}
      <div className="button-row">
        <input
          name="productionUrl"
          placeholder="https://production.example/path"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => run({ url: url.trim() })}>
          {status && status.on ? 'Update' : 'Turn on'}
        </button>
        {status && status.on && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmOff(true)}>
            Turn off
          </button>
        )}
      </div>
      {result && <pre className="terminal output">{result}</pre>}
      {confirmOff && (
        <ConfirmDialog
          title="Turn the media proxy off?"
          message={`Uploads missing from ${site.domain}'s local folder will be 404s again. The production URL is kept for next time.`}
          confirmLabel="Turn off"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => run({ mode: 'off' })}
        />
      )}
    </div>
  );
}

// `wpdev admin-domain <site>` prints one status line; these are its formats
// (kept stable in wpdev for exactly this):
//   On: https://admin.test  →  https://site.test
//   Off (last admin domain: admin.test)
//   Off
export function parseAdminDomain(stdout) {
  const text = (stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
  const on = /On:\s+(https:\/\/\S+)\s+→\s+(https:\/\/\S+)/.exec(text);
  if (on) {
    return { on: true, url: on[1], domain: on[1].replace(/^https:\/\//, '').replace(/:\d+$/, '') };
  }
  const off = /Off \(last admin domain: ([^)\s]+)\)/.exec(text);
  return { on: false, url: null, domain: off ? off[1] : '' };
}

function AdminDomainTab({ site }) {
  const [status, setStatus] = useState(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = () =>
    api
      .adminDomainStatus(site.name)
      .then((r) => {
        const s = parseAdminDomain(r.stdout);
        setStatus(s);
        setDomain((current) => current || s.domain);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const run = async (body) => {
    setConfirmOff(false);
    setBusy(true);
    setResult(null);
    try {
      const r = await api.adminDomain(site.name, body);
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.data?.stdout || e.data?.stderr || e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <div className="tab-panel">
      <p className="muted">
        Moves this site's wp-admin to a separate domain, like a production reverse proxy: requests
        reach the site with its own Host and <code>X-Forwarded-Host</code> set to the admin domain,
        and wp-admin/wp-login.php on {site.domain} redirect there. Only admin paths, wp-json and
        previews pass. wp-admin's links follow the project's own admin-domain code if it defines{' '}
        <code>WP_ADMIN_DOMAIN</code>, otherwise wpdev's mu-plugin, installed when you turn it on and
        removed when you turn it off.
      </p>
      {error && <p className="error">{error}</p>}
      {status && (
        <p className="status-line">
          <span className={status.on ? 'chip chip-success' : 'chip'}>
            {status.on ? 'On' : 'Off'}
          </span>{' '}
          {status.on ? (
            <>
              <a href={`${status.url}/wp-admin/`} target="_blank" rel="noreferrer">
                {status.url}/wp-admin/
              </a>{' '}
              → {siteUrl(site.domain)}
            </>
          ) : (
            `wp-admin is on ${site.domain}.`
          )}
        </p>
      )}
      <div className="button-row">
        <input
          name="adminDomain"
          placeholder={`admin-${site.name}.test`}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !domain.trim()} onClick={() => run({ domain: domain.trim() })}>
          {status && status.on ? 'Update' : 'Turn on'}
        </button>
        {status && status.on && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmOff(true)}>
            Turn off
          </button>
        )}
      </div>
      {result && <pre className="terminal output">{result}</pre>}
      {confirmOff && (
        <ConfirmDialog
          title="Turn the admin domain off?"
          message={`wp-admin goes back to ${site.domain}, ${status.domain} stops being served, and wpdev's mu-plugin (if installed) is removed. The domain is kept for next time.`}
          confirmLabel="Turn off"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => run({ mode: 'off' })}
        />
      )}
    </div>
  );
}

function SnapshotsTab({ site, onRunAction }) {
  const [list, setList] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null); // null, or {snapId} (snapId null = latest)

  const refresh = () => {
    api
      .snapshots(site.name)
      .then((r) => setList(r.stdout))
      .catch((e) => setError(e.message));
  };

  useEffect(refresh, [site.name]);

  const createSnapshot = () => {
    onRunAction({
      title: `Snapshot ${site.domain}`,
      request: {
        method: 'POST',
        path: `/api/sites/${site.name}/snapshots`,
        body: label ? { label } : undefined,
      },
      onFinished: refresh,
    });
    setLabel('');
  };

  const restore = (snapId) => {
    setConfirmRestore(null);
    onRunAction({
      title: `Restore ${site.domain}`,
      request: {
        method: 'POST',
        path: `/api/sites/${site.name}/restore`,
        body: snapId ? { snapId } : undefined,
      },
    });
  };

  const snapIds = list
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d{8}_\d{6}/.test(l));

  return (
    <div className="tab-panel">
      {error && <p className="error">{error}</p>}
      <p className="muted">A snapshot saves this site's files and database together, to restore later.</p>
      <div className="button-row">
        <input
          name="snapshotLabel"
          placeholder="label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="btn btn-primary" onClick={createSnapshot}>
          <Camera size={15} /> Create snapshot
        </button>
      </div>
      {snapIds.length === 0 ? (
        <div className="empty empty-sm">
          <span className="empty-icon">
            <Camera size={20} />
          </span>
          <p>No snapshots yet.</p>
        </div>
      ) : (
        <>
          <div className="section-row">
            <h4>{snapIds.length} snapshot{snapIds.length > 1 ? 's' : ''}</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRestore({ snapId: null })}>
              <RotateCcw size={14} /> Restore latest
            </button>
          </div>
          <ul className="snapshot-list">
            {snapIds.map((id) => (
              <li key={id}>
                <span className="snapshot-icon">
                  <Camera size={15} />
                </span>
                <span className="snapshot-text">
                  <strong>{snapshotDate(id)}</strong>
                  <code>{id}</code>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRestore({ snapId: id })}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {confirmRestore && (
        <ConfirmDialog
          title={`Restore ${site.domain}?`}
          message={`Overwrites the current files and database with ${confirmRestore.snapId || 'the latest snapshot'}. The current state is not saved first.`}
          danger
          onCancel={() => setConfirmRestore(null)}
          onConfirm={() => restore(confirmRestore.snapId)}
        />
      )}
    </div>
  );
}

// Snapshot ids start with wpdev's YYYYMMDD_HHMMSS timestamp, optionally
// followed by a label -- shown as a readable local date, id underneath.
function snapshotDate(id) {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(id);
  if (!m) return id;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function CloneTab({ site, onRunAction }) {
  const [newName, setNewName] = useState('');
  const [confirmClone, setConfirmClone] = useState(false);

  const clone = () => {
    setConfirmClone(false);
    const trimmed = newName.trim();
    if (!trimmed) return;
    onRunAction({
      title: `Clone ${site.domain} -> ${trimmed}.test`,
      request: {
        method: 'POST',
        path: `/api/sites/${site.name}/clone`,
        body: { newName: trimmed },
      },
    });
  };

  return (
    <div className="tab-panel">
      <p className="muted">Duplicates files and database under a new domain, with its own database password.</p>
      <div className="button-row">
        <div className="input-affix">
          <input
            name="cloneName"
            placeholder="new-site-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <span className="mono">.test</span>
        </div>
        <button className="btn btn-primary" disabled={!newName.trim()} onClick={() => setConfirmClone(true)}>
          <Copy size={15} /> Clone
        </button>
      </div>
      {confirmClone && (
        <ConfirmDialog
          title="Clone this site?"
          message={`Creates sites/${newName.trim()} and ${siteUrl(`${newName.trim()}.test`)} as a full copy of ${site.domain} (files + database).`}
          confirmLabel="Clone"
          onCancel={() => setConfirmClone(false)}
          onConfirm={clone}
        />
      )}
    </div>
  );
}

function WpCliTab({ site }) {
  const [cmd, setCmd] = useState('plugin list');
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState(null);
  const [confirmRun, setConfirmRun] = useState(false);

  const run = async () => {
    setConfirmRun(false);
    const args = cmd.trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) return;
    setBusy(true);
    setOutput(null);
    try {
      const r = await api.wpCli(site.name, args);
      setOutput(r.stdout || r.stderr || '(no output)');
    } catch (e) {
      setOutput(e.data?.stderr || e.data?.stdout || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tab-panel">
      <p className="muted">Runs WP-CLI against this site's real files and database.</p>
      <form
        className="cli-prompt"
        onSubmit={(e) => {
          e.preventDefault();
          if (cmd.trim()) setConfirmRun(true);
        }}
      >
        <span className="cli-prompt-sign mono">$ wp</span>
        <input name="wpCliArgs" value={cmd} onChange={(e) => setCmd(e.target.value)} spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !cmd.trim()}>
          {busy ? 'Running…' : 'Run'}
        </button>
      </form>
      <div className="cli-suggestions">
        {['plugin list', 'theme list', 'user list', 'option get home', 'cache flush', 'core version'].map((c) => (
          <button key={c} type="button" className="filter-pill" onClick={() => setCmd(c)}>
            {c}
          </button>
        ))}
      </div>
      {busy && <Skeleton height={80} radius={10} />}
      {output && <pre className="terminal output">{output}</pre>}
      {confirmRun && (
        <ConfirmDialog
          title="Run this WP-CLI command?"
          message={`wp ${cmd} -- runs directly against ${site.domain}'s real database and files. Some commands (e.g. db reset, option delete) are not reversible.`}
          confirmLabel="Run"
          danger
          onCancel={() => setConfirmRun(false)}
          onConfirm={run}
        />
      )}
    </div>
  );
}

function RemoveTab({ site, onRunAction, onRemoved }) {
  const [confirmText, setConfirmText] = useState('');

  const remove = () => {
    if (confirmText !== site.domain) return;
    onRunAction({
      title: `Remove ${site.domain}`,
      request: { method: 'DELETE', path: `/api/sites/${site.name}` },
      onFinished: (code) => {
        if (code === 0) onRemoved();
      },
    });
  };

  return (
    <div className="tab-panel">
      <div className="danger-zone">
        <h4>
          <Trash2 size={16} /> Delete this site
        </h4>
        <p>
          Permanently deletes this site's files, database, nginx config, SSL certificate and
          settings. There is no undo (snapshots are not touched).
        </p>
        <p className="muted">
          Type <code>{site.domain}</code> to confirm.
        </p>
        <div className="button-row">
        <input name="confirmDomain" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <button
          className="btn btn-danger"
          disabled={confirmText !== site.domain}
          onClick={remove}
        >
          Delete permanently
        </button>
        </div>
      </div>
    </div>
  );
}
