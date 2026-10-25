import { useContext, useEffect, useRef, useState } from 'react';
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
  Database,
  Download,
  Upload,
  FileUp,
  History,
  Clock,
  Bug,
  Share2,
  Wifi,
  Globe,
  QrCode,
  KeyRound,
  Timer,
  ExternalLink,
  Power,
  Loader2,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { api, siteUrl, exportFileName } from '../api';
import ConfirmDialog, { TypeToConfirmDialog } from './ConfirmDialog';
import { Avatar, Chip, Drawer, Output, Skeleton, useToast } from './ui';
import { stripAnsi } from '../lib/parse';
import { dumpTables } from '../lib/dump';
import { formatBytes, lastOutputLine } from '../lib/format';
import { DebugSettings, Switch } from './Debug';
import { PowerContext } from './SiteCard';

// Grouped down the side of the drawer; Remove sits apart, at the bottom.
const TAB_GROUPS = [
  {
    label: 'Site',
    tabs: [
      { id: 'Overview', icon: Info },
      { id: 'Power', icon: Power },
      { id: 'Cache', icon: Gauge },
      { id: 'Media', icon: Image },
      { id: 'Admin domain', icon: ShieldCheck },
    ],
  },
  {
    label: 'Data',
    tabs: [
      { id: 'Database', icon: Database },
      { id: 'Snapshots', icon: Camera },
      { id: 'Clone', icon: Copy },
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { id: 'Share', icon: Share2 },
      { id: 'Debug', icon: Bug },
      { id: 'WP-CLI', icon: SquareTerminal },
    ],
  },
];
const REMOVE_TAB = { id: 'Remove', icon: Trash2, danger: true };

export default function SiteManageDialog({ site, initialTab = 'Overview', onClose, onRunAction, onRemoved, onOpenDebug, onOpenTool }) {
  const [tab, setTab] = useState(initialTab);
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
            {/* Deep-linked to this site's own DB user -- the sidebar's
                Adminer opens as root, which this site's password won't fit. */}
            <button type="button" className="link-button" onClick={() => onOpenTool('adminer', site.name)}>
              <Database size={14} /> Adminer
            </button>
            {site.php && <Chip mono>PHP {site.php}</Chip>}
          </div>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-split">
      <nav className="drawer-nav" role="tablist" aria-orientation="vertical" aria-label="Site settings">
        {TAB_GROUPS.map((group) => (
          <div className="drawer-nav-group" key={group.label}>
            <span className="drawer-nav-label">{group.label}</span>
            {group.tabs.map((t) => (
              <DrawerTab key={t.id} {...t} active={t.id === tab} onSelect={setTab} />
            ))}
          </div>
        ))}
        <div className="drawer-nav-group drawer-nav-end">
          <DrawerTab {...REMOVE_TAB} active={tab === REMOVE_TAB.id} onSelect={setTab} />
        </div>
      </nav>
      <div className="drawer-body" key={tab} role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && <OverviewTab site={site} />}
        {tab === 'Power' && <PowerTab site={site} />}
        {tab === 'Cache' && <CacheTab site={site} />}
        {tab === 'Media' && <MediaTab site={site} />}
        {tab === 'Admin domain' && <AdminDomainTab site={site} />}
        {tab === 'Snapshots' && <SnapshotsTab site={site} onRunAction={onRunAction} />}
        {tab === 'Database' && <DatabaseTab site={site} />}
        {tab === 'Clone' && <CloneTab site={site} onRunAction={onRunAction} />}
        {tab === 'Share' && <ShareTab site={site} />}
        {tab === 'Debug' && <DebugTab site={site} onOpenDebug={onOpenDebug} />}
        {tab === 'WP-CLI' && <WpCliTab site={site} />}
        {tab === 'Remove' && <RemoveTab site={site} onRunAction={onRunAction} onRemoved={onRemoved} />}
      </div>
      </div>
    </Drawer>
  );
}

function DrawerTab({ id, icon: Icon, danger, active, onSelect }) {
  // On a narrow screen the nav is one sideways-scrolling row; keep the
  // open tab in it visible.
  const ref = useRef(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      className={`drawer-tab${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
      onClick={() => onSelect(id)}
    >
      <Icon size={15} />
      <span>{id}</span>
    </button>
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
        {creds && rows.length === 0 && <Output>{creds}</Output>}
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
        {result && <Output>{result}</Output>}
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

// `wpdev on|off` and `wpdev auto-off`, via /api/sites/:name/power.
const AUTO_OFF_CHOICES = [
  { value: 'default', label: 'Default' },
  { value: 'never', label: 'Never' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '1w', label: '1 week' },
];
const AUTO_OFF_UNIT = { m: 'minute', h: 'hour', d: 'day', w: 'week' };

function describeAutoOff(value) {
  const m = /^(\d+)([mhdw])$/.exec(value || '');
  if (!m) return 'never';
  return `after ${m[1]} ${AUTO_OFF_UNIT[m[2]]}${m[1] === '1' ? '' : 's'} without a visit`;
}

function formatWhen(ms) {
  return ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function PowerTab({ site }) {
  const toast = useToast();
  const onChanged = useContext(PowerContext);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'state' | 'auto'

  const load = () =>
    api
      .power(site.name)
      .then((r) => {
        setData(r);
        setError(null);
        return r;
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const save = async (body, what) => {
    setBusy(what);
    try {
      const r = await api.setPower(site.name, body);
      setData(r);
      if (body.state) {
        toast({ tone: 'success', title: body.state === 'on' ? `${site.domain} is on` : `${site.domain} is off` });
        onChanged();
      } else {
        toast({ tone: 'success', title: r.autoOff === 'never' ? 'Auto-off disabled' : `Switches off ${describeAutoOff(r.autoOff)}` });
      }
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't change it", description: lastOutputLine(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const off = data?.state === 'off';
  const choice = data ? (data.autoOffSource === 'default' ? 'default' : data.autoOff) : null;
  const known = AUTO_OFF_CHOICES.some((o) => o.value === choice);

  return (
    <div className="tab-panel">
      <p className="muted">
        A site you aren&rsquo;t using can be switched off: it shows a short &ldquo;this site is off&rdquo; page, its
        WP-Cron stops, and its PHP container stops when no site that&rsquo;s on uses the same PHP version. Files,
        database and settings stay as they are.
      </p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <Skeleton height={120} radius={12} />}
      {data && (
        <>
          <section className="panel-section">
            <div className="section-row">
              <h4>Site is {off ? 'off' : 'on'}</h4>
              <Switch
                checked={!off}
                disabled={busy !== null}
                label={off ? `Switch ${site.domain} on` : `Switch ${site.domain} off`}
                onChange={(on) => save({ state: on ? 'on' : 'off' }, 'state')}
              />
            </div>
            <dl className="kv">
              {off ? (
                <div className="kv-row">
                  <dt>Off since</dt>
                  <dd>
                    {formatWhen(data.offSince)}
                    {data.offBy === 'auto-off' && <Chip tone="muted">by auto-off</Chip>}
                  </dd>
                </div>
              ) : (
                <>
                  <div className="kv-row">
                    <dt>Idle since</dt>
                    <dd>{formatWhen(data.idleSince)}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Switches off</dt>
                    <dd>{data.offAt ? `around ${formatWhen(Math.max(data.offAt, Date.now()))}` : 'never'}</dd>
                  </div>
                </>
              )}
            </dl>
            {busy === 'state' && <p className="field-hint">{off ? 'Starting its PHP…' : 'Switching off…'}</p>}
          </section>

          <section className="panel-section">
            <h4>Auto-off</h4>
            <div className="choice-row" role="radiogroup" aria-label="Switch off by itself">
              {AUTO_OFF_CHOICES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={choice === o.value}
                  className={`choice${choice === o.value ? ' is-active' : ''}`}
                  disabled={busy !== null}
                  onClick={() => o.value !== choice && save({ autoOff: o.value }, 'auto')}
                >
                  {o.label}
                </button>
              ))}
              {!known && choice && (
                <button type="button" role="radio" aria-checked className="choice is-active mono">
                  {choice}
                </button>
              )}
            </div>
            <p className="field-hint">
              {data.autoOffSource === 'default'
                ? `Default (AUTO_OFF_AFTER in .env): ${describeAutoOff(data.autoOff)}.`
                : `Switches off ${describeAutoOff(data.autoOff)}.`}{' '}
              Idle time counts from the last browser request (not wpdev&rsquo;s own checks or WordPress calling itself), from
              when the site was last switched on, or from when the stack last started, whichever is latest.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// Redis object cache for one site, through WP-CLI. "On" means the
// redis-cache plugin is active and its object-cache drop-in is installed;
// turning it off removes the drop-in AND deactivates the plugin, and turning
// it on reactivates the plugin first. The shared Redis container is never
// touched.
function RedisSection({ site }) {
  // 'Connected' | 'Not enabled' (plugin on, drop-in off) | 'Plugin inactive'
  // | 'Not installed' | other redis status text | 'unavailable' | null (unknown)
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null); // where the switch is heading while a change runs
  const [result, setResult] = useState(null);
  // Refreshes the page's status table, which is what the site card's Redis chip reads.
  const onChanged = useContext(PowerContext);

  const wp = (...args) => api.wpCli(site.name, args);

  const refresh = async () => {
    try {
      let plugin;
      try {
        plugin = stripAnsi((await wp('plugin', 'get', 'redis-cache', '--field=status')).stdout || '').trim();
      } catch {
        setState('Not installed');
        return;
      }
      if (plugin !== 'active') {
        setState('Plugin inactive');
        return;
      }
      const r = await wp('redis', 'status');
      const m = /^Status:\s*(.+)$/m.exec(stripAnsi(r.stdout || ''));
      setState(m ? m[1].trim() : 'unavailable');
    } catch {
      setState('unavailable');
    }
  };

  // A switched-off site has no PHP running, so WP-CLI (and so Redis) can't be
  // reached until it's switched on.
  useEffect(() => {
    if (!site.off) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name, site.off]);

  const run = async (turnOn) => {
    setBusy(true);
    setTarget(turnOn);
    setResult(null);
    const out = [];
    try {
      const steps = turnOn
        ? [['plugin', 'activate', 'redis-cache'], ['redis', 'enable']]
        : [['redis', 'disable'], ['plugin', 'deactivate', 'redis-cache']];
      for (const step of steps) {
        // Skip a step that has nothing to do (e.g. activating an active plugin
        // is fine, but `redis disable` needs the plugin's command to exist).
        if (!turnOn && state === 'Plugin inactive' && step[0] === 'redis') continue;
        const r = await wp(...step);
        out.push(stripAnsi(r.stdout || r.stderr || '').trim());
      }
    } catch (e) {
      out.push(stripAnsi(e.data?.stderr || e.data?.stdout || e.message).trim());
    } finally {
      setResult(out.filter(Boolean).join('\n'));
      await refresh();
      setBusy(false);
      setTarget(null);
      onChanged();
    }
  };

  const known = state === 'Connected' || state === 'Not enabled' || state === 'Plugin inactive';
  return (
    <>
      <div className="switch-row">
        <span className="switch-text">
          <strong>Redis object cache</strong>
          <span>
            Keeps database lookups in memory for this site. Turning it off also deactivates the
            redis-cache plugin on this site; the shared Redis container keeps running.
            {site.off
              ? ' Switch this site on to change it.'
              : state === 'Not installed'
                ? ' The redis-cache plugin isn’t installed on this site.'
                : !known && state !== null && ` Status: ${state}.`}
          </span>
        </span>
        {site.off ? (
          <Chip tone="muted">Site is off</Chip>
        ) : (
          <Switch
            label="Redis object cache"
            checked={busy && target !== null ? target : state === 'Connected'}
            loading={busy || state === null}
            disabled={!known}
            onChange={run}
          />
        )}
      </div>
      {result && <Output>{result}</Output>}
    </>
  );
}

function CacheTab({ site }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [on, setOn] = useState(null); // full-page cache: true / false, null while reading it, 'error' if it can't be read
  const [target, setTarget] = useState(null); // where the switch is heading while a change runs

  const refresh = async () => {
    try {
      const r = await api.cacheStatus(site.name);
      const m = /Full-page cache:\s*(on|off)/.exec(stripAnsi(r.stdout || ''));
      setOn(m ? m[1] === 'on' : 'error');
    } catch {
      setOn('error');
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const toggle = async (mode) => {
    setBusy(true);
    setTarget(mode === 'on');
    setResult(null);
    try {
      const r = await api.cache(site.name, mode);
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.data?.stdout || e.data?.stderr || e.message);
    } finally {
      await refresh();
      setBusy(false);
      setTarget(null);
    }
  };

  return (
    <div className="tab-panel">
      <div className="switch-list">
        <div className="switch-row">
          <span className="switch-text">
            <strong>Full-page cache</strong>
            <span>
              Nginx serves repeat visitors a saved copy of each page. Logged-in users and wp-admin are never cached.
              {on === 'error' && ' Couldn’t read its current state — update wpdev (wpdev update) and reopen this tab.'}
            </span>
          </span>
          <Switch
            label="Full-page cache"
            checked={busy && target !== null ? target : on === true}
            loading={busy || on === null}
            disabled={on === 'error'}
            onChange={(next) => toggle(next ? 'on' : 'off')}
          />
        </div>
        <RedisSection site={site} />
      </div>
      {result && <Output>{result}</Output>}
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
      {result && <Output>{result}</Output>}
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
      {result && <Output>{result}</Output>}
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


// ---------------------------------------------------------------------------
// Share: the site on other devices, for a while (`wpdev share`)
// ---------------------------------------------------------------------------
const SHARE_DURATIONS = ['15m', '30m', '1h', '2h', '4h', '1d'];
const DURATION_LABEL = { '15m': '15 min', '30m': '30 min', '1h': '1 hour', '2h': '2 hours', '4h': '4 hours', '1d': '1 day' };

// Four letters and four digits: easy to read out to someone across a room.
function randomPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join('');
  return `${pick(letters, 4)}${pick('23456789', 4)}`;
}

function countdown(ms) {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function QrImage({ text }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null;
    let stale = false;
    api
      .qrCode(text)
      .then((u) => {
        url = u;
        if (!stale) setSrc(u);
      })
      .catch(() => {});
    return () => {
      stale = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [text]);
  return <div className="share-qr">{src ? <img src={src} alt={`QR code for ${text}`} /> : <Skeleton width={148} height={148} />}</div>;
}

// One address to hand out: copy, open, and a QR code for a phone.
function ShareAddress({ icon: Icon, title, hint, url, state }) {
  const [qr, setQr] = useState(false);
  return (
    <div className="share-address">
      <div className="share-address-head">
        <span className="share-address-icon">
          <Icon size={16} />
        </span>
        <span className="share-address-text">
          <strong>{title}</strong>
          <span>{hint}</span>
        </span>
      </div>
      {url ? (
        <>
          <div className="share-url">
            <a className="mono" href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
            <CopyButton text={url} label="the address" />
            <a className="btn btn-icon btn-ghost btn-xs" href={url} target="_blank" rel="noreferrer" title="Open" aria-label={`Open ${url}`}>
              <ExternalLink size={13} />
            </a>
            <button type="button" className={`btn btn-icon btn-ghost btn-xs${qr ? ' is-active' : ''}`} onClick={() => setQr((v) => !v)} title="QR code" aria-label="Show a QR code" aria-pressed={qr}>
              <QrCode size={13} />
            </button>
          </div>
          {qr && <QrImage text={url} />}
        </>
      ) : (
        <p className="field-hint">{state}</p>
      )}
    </div>
  );
}

function ShareTab({ site }) {
  const toast = useToast();
  const [share, setShare] = useState(null); // wpdev's status, or {shared: false}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'start' | 'stop' | 'extend'
  const [now, setNow] = useState(Date.now());
  // The form, for starting (and the settings a running share keeps).
  const [duration, setDuration] = useState('1h');
  const [isPublic, setIsPublic] = useState(false);
  const [usePassword, setUsePassword] = useState(true);
  const [password, setPassword] = useState(randomPassword);
  const [admin, setAdmin] = useState(false);

  const load = () =>
    api
      .share(site.name)
      .then((r) => {
        setShare(r);
        setError(null);
        return r;
      })
      .catch((e) => setError(lastOutputLine(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  // The countdown, and a fresh look when the share ends or the tunnel is
  // still getting its address.
  useEffect(() => {
    if (!share?.shared) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [share?.shared]);
  useEffect(() => {
    if (!share?.shared) return undefined;
    if (share.until && share.until - now <= 0) {
      const t = setTimeout(load, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now >= (share?.until || Infinity)]);
  useEffect(() => {
    if (share?.tunnel !== 'starting') return undefined;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.tunnel]);

  const start = async (body, kind = 'start') => {
    setBusy(kind);
    try {
      const r = await api.startShare(site.name, body);
      setShare(r);
      if (body.public && !r.publicUrl) {
        toast({ tone: 'warning', title: "The public link didn't come up", description: lastOutputLine({ data: r }), duration: 9000 });
      } else if (kind === 'start') {
        toast({ tone: 'success', title: `Sharing ${site.domain}`, description: `Until ${new Date(r.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` });
      }
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't share it", description: lastOutputLine(e), duration: 9000 });
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    setBusy('stop');
    try {
      await api.stopShare(site.name);
      await load();
      toast({ tone: 'success', title: `Stopped sharing ${site.domain}` });
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't stop it", description: lastOutputLine(e) });
    } finally {
      setBusy(null);
    }
  };

  // Another hour from now, keeping everything else as it is.
  const extend = () =>
    start(
      { duration: `${Math.min(1440, Math.ceil(Math.max(0, share.until - Date.now()) / 60000) + 60)}m`, public: Boolean(share.publicUrl) || share.tunnel !== 'off', admin: share.admin, password: share.password },
      'extend',
    );

  if (error) return <div className="tab-panel"><p className="error">{error}</p></div>;
  if (!share) return <div className="tab-panel"><Skeleton height={220} /></div>;

  if (share.shared) {
    const left = share.until - now;
    return (
      <div className="tab-panel">
        <div className="share-live">
          <span className="share-live-dot" />
          <span className="share-live-text">
            <strong>Shared</strong>
            <span>
              Ends in <span className="mono">{countdown(left)}</span>, at {new Date(share.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={extend} disabled={busy !== null}>
            <Timer size={14} /> {busy === 'extend' ? 'Extending…' : '+1 hour'}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={stop} disabled={busy !== null}>
            {busy === 'stop' ? 'Stopping…' : 'Stop sharing'}
          </button>
        </div>

        <ShareAddress
          icon={Wifi}
          title="On your network"
          hint="Phones, tablets and computers on the same Wi-Fi or LAN."
          url={share.lanUrl}
          state="Couldn't work out this machine's network address."
        />
        {share.tunnel !== 'off' && (
          <ShareAddress
            icon={Globe}
            title="Public link"
            hint="Anyone with it, anywhere, through localhost.run. A new link if the tunnel reconnects."
            url={share.publicUrl}
            state={share.tunnel === 'starting' ? 'Getting an address…' : "The tunnel is down. Extend the share to start it again."}
          />
        )}

        <div className="share-facts">
          {share.password ? (
            <span>
              <KeyRound size={13} /> Password: user <code>preview</code>, password <code>{share.password}</code>{' '}
              <CopyButton text={share.password} label="the password" />
            </span>
          ) : (
            <span>
              <KeyRound size={13} /> No password: anyone with the address can open it.
            </span>
          )}
          <span>
            <ShieldCheck size={13} /> {share.admin ? 'wp-admin and login are included.' : 'wp-admin and login are left out.'} Search engines are told not to index it.
          </span>
        </div>
        <p className="field-hint">
          A phone that can't connect on your network is usually blocked by this machine's firewall: allow port{' '}
          <code>{share.port}</code>. Nothing in WordPress changes; addresses are rewritten on the way out.
        </p>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <p className="muted">
        Show this site on a phone, tablet or another computer, say for a presentation. Its pages are served at a temporary
        address, with links rewritten to match. Nothing in WordPress changes, and it stops on its own.
      </p>

      <div className="switch-list">
        <div className="switch-row">
          <span className="switch-text">
            <strong>
              <Wifi size={14} /> On your network
            </strong>
            <span>Always: devices on the same Wi-Fi or LAN, through this machine's address.</span>
          </span>
          <Switch label="On your network" checked disabled onChange={() => {}} />
        </div>
        <div className="switch-row">
          <span className="switch-text">
            <strong>
              <Globe size={14} /> Public link
            </strong>
            <span>A temporary https:// address that works anywhere, through localhost.run (free, no account). Anyone with the link can reach it.</span>
          </span>
          <Switch label="Public link" checked={isPublic} onChange={setIsPublic} />
        </div>
        <div className="switch-row">
          <span className="switch-text">
            <strong>
              <KeyRound size={14} /> Password
            </strong>
            <span>Visitors sign in as <code>preview</code> before anything loads.</span>
            {usePassword && (
              <span className="share-password">
                <input className="mono" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" spellCheck={false} />
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPassword(randomPassword())}>
                  New
                </button>
              </span>
            )}
          </span>
          <Switch label="Password" checked={usePassword} onChange={setUsePassword} />
        </div>
        <div className="switch-row">
          <span className="switch-text">
            <strong>
              <ShieldCheck size={14} /> Include wp-admin
            </strong>
            <span>Off: the dashboard and login page aren't reachable on the shared address. Turn on only if visitors need to sign in.</span>
          </span>
          <Switch label="Include wp-admin" checked={admin} onChange={setAdmin} />
        </div>
      </div>

      <div className="field">
        <span className="field-label">For</span>
        <div className="choice-row backup-every" role="radiogroup" aria-label="Share for">
          {SHARE_DURATIONS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={duration === d} className={`choice${duration === d ? ' is-active' : ''}`} onClick={() => setDuration(d)}>
              {DURATION_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      {usePassword && !/^[\x20-\x7e]{4,64}$/.test(password) && <p className="field-hint field-hint-error">The password needs 4 to 64 characters.</p>}

      <div className="button-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null || (usePassword && !/^[\x20-\x7e]{4,64}$/.test(password))}
          onClick={() => start({ duration, public: isPublic, admin, password: usePassword ? password : null })}
        >
          <Share2 size={15} /> {busy === 'start' ? (isPublic ? 'Opening the tunnel…' : 'Starting…') : 'Start sharing'}
        </button>
      </div>
    </div>
  );
}

// The debug switches; the log itself has a page of its own, with room for it.
function DebugTab({ site, onOpenDebug }) {
  const [state, setState] = useState(null);
  return (
    <div className="tab-panel">
      <DebugSettings site={site} onState={setState} />
      <section className="panel-section">
        <h4>Debug log</h4>
        <div className="debug-open">
          <span>
            <strong>
              <code>{state?.log || 'wp-content/debug.log'}</code>
            </strong>
            <span>{state ? `${formatBytes(state.logBytes || 0)} · read it by level, search it, or watch it live` : '…'}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenDebug(site)}>
            <Bug size={14} /> Open the log viewer
          </button>
        </div>
      </section>
    </div>
  );
}

// Automatic backup intervals offered as choices; "Custom" takes any
// number and m/h/d/w that wpdev accepts (5m at least).
const BACKUP_EVERY = [
  { value: 'off', label: 'Off' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '1d', label: 'Daily' },
  { value: '1w', label: 'Weekly' },
];
const EVERY_RE = /^(\d{1,4})([mhdw])$/;
const UNIT = { m: ['minute', 60e3], h: ['hour', 3600e3], d: ['day', 86400e3], w: ['week', 604800e3] };

function everyMs(every) {
  const m = EVERY_RE.exec(every || '');
  return m ? Number(m[1]) * UNIT[m[2]][1] : null;
}

function describeEvery(every) {
  const m = EVERY_RE.exec(every || '');
  if (!m) return 'off';
  const [word] = UNIT[m[2]];
  return m[1] === '1' ? `every ${word}` : `every ${m[1]} ${word}s`;
}

function timeAgo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

// Database backups into backups/<site>/: made now (kept until deleted) or
// on a schedule the api keeps (the newest N kept). Restoring one first
// backs up the current database, so a restore can itself be undone.
// Suggestions for a backup's suffix, and the suffix as wpdev will save it
// (its backup_suffix): lower case, spaces/underscores as dashes, the rest
// dropped, 40 characters at most.
const BACKUP_SUFFIXES = ['before-import', 'before-update', 'before-migration', 'before-plugin-change', 'clean-install'];
function backupSuffix(text) {
  return text
    .toLowerCase()
    .replace(/[ _]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

function BackupsSection({ site, onRestored }) {
  const toast = useToast();
  const [data, setData] = useState(null); // {schedule: {every, keep}, backups: [...]}
  const [error, setError] = useState(null);
  const [choice, setChoice] = useState(null); // a BACKUP_EVERY value or 'custom'
  const [custom, setCustom] = useState('');
  const [keep, setKeep] = useState('');
  const [busy, setBusy] = useState(null); // 'now' | 'schedule' | file being restored/deleted
  const [confirm, setConfirm] = useState(null); // {action: 'restore'|'delete', file}
  const [now, setNow] = useState(Date.now());
  // Ends the next backup's file name instead of "manual"; wpdev tidies it.
  const [suffix, setSuffix] = useState('');
  const suffixClean = backupSuffix(suffix);
  const suffixValid = !suffix.trim() || (suffixClean !== '' && suffixClean !== 'auto');

  const load = () =>
    api
      .backups(site.name)
      .then((r) => {
        setData(r);
        setError(null);
        return r;
      })
      .catch((e) => setError(stripAnsi(e.data?.stderr || e.message)));

  // The form starts from what's saved.
  const resetForm = (r) => {
    const every = r?.schedule.every || 'off';
    const known = BACKUP_EVERY.some((o) => o.value === every);
    setChoice(known ? every : 'custom');
    setCustom(known ? '' : every);
    setKeep(String(r?.schedule.keep || 7));
  };

  useEffect(() => {
    load().then(resetForm);
    // Scheduled backups land on their own; keep the list (and "next in")
    // current while the tab is open.
    const id = setInterval(() => {
      setNow(Date.now());
      load();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const every = choice === 'custom' ? custom.trim().toLowerCase() : choice;
  const customValid = choice !== 'custom' || (EVERY_RE.test(every) && everyMs(every) >= 300e3);
  const keepValid = /^\d{1,4}$/.test(keep) && Number(keep) >= 1;
  const saved = data?.schedule;
  const dirty = saved && choice !== null && ((saved.every || 'off') !== every || String(saved.keep) !== keep);

  const saveSchedule = async () => {
    setBusy('schedule');
    try {
      await api.backupSchedule(site.name, { every, keep: Number(keep) });
      const r = await load();
      resetForm(r);
      toast({
        tone: 'success',
        title: every === 'off' ? 'Automatic backups off' : `Backing up ${describeEvery(every)}`,
        description: every === 'off' ? undefined : `Keeping the newest ${keep}.`,
      });
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't save the schedule", description: lastOutputLine(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const backupNow = async () => {
    setBusy('now');
    try {
      await api.backupNow(site.name, suffixClean || undefined);
      await load();
      setSuffix('');
      toast({ tone: 'success', title: 'Backed up', description: suffixClean ? `${site.domain} · ${suffixClean}` : site.domain });
    } catch (e) {
      toast({ tone: 'error', title: 'Backup failed', description: lastOutputLine(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file) => {
    setConfirm(null);
    setBusy(file);
    try {
      await api.backupNow(site.name, 'before-restore');
      await api.restoreBackup(site.name, file);
      await load();
      onRestored?.();
      toast({ tone: 'success', title: 'Database restored', description: `${file} — the previous state is backed up too.` });
    } catch (e) {
      toast({ tone: 'error', title: 'Restore failed', description: lastOutputLine(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (file) => {
    setConfirm(null);
    setBusy(file);
    try {
      await api.deleteBackup(site.name, file);
      await load();
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't delete it", description: lastOutputLine(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const download = (file) =>
    api.downloadBackup(site.name, file).catch((e) => toast({ tone: 'error', title: 'Download failed', description: e.message }));

  const backups = data?.backups || [];
  const lastAuto = backups.find((b) => b.kind === 'auto');
  const interval = everyMs(saved?.every);
  const nextIn = interval && (lastAuto ? lastAuto.time + interval - now : 0);

  return (
    <section className="panel-section">
      <div className="section-row">
        <h4>Backups</h4>
        <div className="backup-now">
          <input
            className="mono"
            list="backup-suffixes"
            placeholder="manual"
            aria-label="Backup suffix (optional)"
            title="Ends the file name instead of “manual”, e.g. before-import"
            value={suffix}
            disabled={busy !== null}
            onChange={(e) => setSuffix(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && suffixValid && busy === null && backupNow()}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="backup-suffixes">
            {BACKUP_SUFFIXES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button type="button" className="btn btn-primary btn-sm" onClick={backupNow} disabled={busy !== null || !suffixValid}>
            <History size={14} /> {busy === 'now' ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
      </div>
      {suffix.trim() && (
        <span className={`field-hint${suffixValid ? '' : ' field-hint-error'}`}>
          {suffixValid ? (
            <>
              Saved as <code>{`${site.name}_<date>_${suffixClean}.sql.gz`}</code>, kept until you delete it.
            </>
          ) : (
            'Letters, digits and dashes — and not “auto”, which is for scheduled backups.'
          )}
        </span>
      )}
      {error && <p className="error">{error}</p>}
      {!data && !error && <Skeleton height={90} />}
      {data && (
        <>
          <div className="field">
            <span className="field-label">Automatic backups</span>
            <div className="choice-row backup-every" role="radiogroup" aria-label="Automatic backup interval">
              {[...BACKUP_EVERY, { value: 'custom', label: 'Custom' }].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={choice === o.value}
                  className={`choice${choice === o.value ? ' is-active' : ''}`}
                  onClick={() => setChoice(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="backup-schedule-row">
              {choice === 'custom' && (
                <label className="backup-inline">
                  <span>Every</span>
                  <input
                    className="mono"
                    placeholder="12h"
                    aria-label="Custom interval"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              )}
              {choice !== 'off' && (
                <label className="backup-inline">
                  <span>Keep the newest</span>
                  <input type="number" min={1} max={9999} aria-label="Backups to keep" value={keep} onChange={(e) => setKeep(e.target.value)} />
                </label>
              )}
              {dirty && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={saveSchedule} disabled={busy !== null || !customValid || !keepValid}>
                  Save
                </button>
              )}
            </div>
            {choice === 'custom' && custom && !customValid && (
              <span className="field-hint field-hint-error">A number and m, h, d or w — e.g. 30m, 12h, 3d — at least 5 minutes</span>
            )}
            <span className="field-hint field-hint-icon">
              <Clock size={13} />
              {saved?.every
                ? `Backing up ${describeEvery(saved.every)}, keeping the newest ${saved.keep} automatic backups; ${
                    nextIn > 60e3 ? `next in about ${timeAgo(nextIn)}` : 'next within a minute'
                  }. Runs while the stack is up. Backups you make yourself are kept until you delete them.`
                : 'Off. Backups you make yourself are kept until you delete them.'}
            </span>
          </div>

          {backups.length === 0 ? (
            <div className="empty empty-sm">
              <span className="empty-icon">
                <History size={20} />
              </span>
              <p>No backups yet.</p>
            </div>
          ) : (
            <ul className="snapshot-list backup-list">
              {backups.map((b) => (
                <li key={b.file}>
                  <span className="snapshot-icon">{b.kind === 'auto' ? <Clock size={15} /> : <History size={15} />}</span>
                  <span className="snapshot-text">
                    <strong>
                      {new Date(b.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{' '}
                      <span className="muted">· {timeAgo(now - b.time)}{now - b.time >= 60e3 ? ' ago' : ''}</span>
                    </strong>
                    <span className="backup-meta">
                      <Chip tone={b.kind === 'auto' ? 'info' : undefined}>{b.kind === 'auto' ? 'Automatic' : 'Manual'}</Chip>
                      {b.label && <Chip>{b.label}</Chip>}
                      {formatBytes(b.bytes)}
                    </span>
                  </span>
                  <span className="backup-actions">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Download" aria-label={`Download ${b.file}`} onClick={() => download(b.file)}>
                      <Download size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy !== null}
                      onClick={() => setConfirm({ action: 'restore', file: b.file })}
                    >
                      {busy === b.file ? 'Working…' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Delete"
                      aria-label={`Delete ${b.file}`}
                      disabled={busy !== null}
                      onClick={() => setConfirm({ action: 'delete', file: b.file })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {confirm?.action === 'restore' && (
        <ConfirmDialog
          title={`Restore ${site.domain}'s database?`}
          message={`Its database is replaced by ${confirm.file}. The current one is backed up first, so you can go back.`}
          confirmLabel="Restore"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => restore(confirm.file)}
        />
      )}
      {confirm?.action === 'delete' && (
        <ConfirmDialog
          title="Delete this backup?"
          message={`${confirm.file} is deleted for good.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm.file)}
        />
      )}
    </section>
  );
}


// A checklist of a database's tables -- all, some or none -- with a
// filter once there are enough to need one. `selected` is a Set of names.
function TablePicker({ tables, selected, onChange, disabled, sizeLabel = '' }) {
  const [filter, setFilter] = useState('');
  const shown = filter ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())) : tables;
  const all = selected.size === tables.length;
  const none = selected.size === 0;

  const toggle = (name) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };
  // The header box acts on what's shown: with a filter, just those.
  const shownAll = shown.every((t) => selected.has(t.name));
  const toggleShown = () => {
    const next = new Set(selected);
    for (const t of shown) {
      if (shownAll) next.delete(t.name);
      else next.add(t.name);
    }
    onChange(next);
  };

  return (
    <div className={`table-picker${disabled ? ' is-disabled' : ''}`}>
      <div className="table-picker-head">
        <label className="check">
          <input
            type="checkbox"
            checked={shown.length > 0 && shownAll}
            ref={(el) => el && (el.indeterminate = !shownAll && shown.some((t) => selected.has(t.name)))}
            onChange={toggleShown}
            disabled={disabled || shown.length === 0}
          />
          <span>
            {all ? `All ${tables.length} tables` : none ? 'No tables' : `${selected.size} of ${tables.length} tables`}
          </span>
        </label>
        {tables.length > 8 && (
          <input
            className="table-picker-filter"
            type="search"
            placeholder="Filter tables"
            aria-label="Filter tables"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={disabled}
          />
        )}
      </div>
      <ul className="table-picker-list">
        {shown.map((t) => (
          <li key={t.name}>
            <label className="check">
              <input type="checkbox" checked={selected.has(t.name)} onChange={() => toggle(t.name)} disabled={disabled} />
              <span className="mono table-picker-name">{t.name}</span>
              {t.rows !== undefined && (
                <span className="table-picker-meta" title="MySQL's estimate">
                  {t.rows.toLocaleString()} {t.rows === 1 ? 'row' : 'rows'}
                </span>
              )}
              <span className="table-picker-meta">
                {sizeLabel}
                {formatBytes(t.bytes)}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="table-picker-empty">No table matches “{filter}”.</li>}
      </ul>
    </div>
  );
}

// `wpdev db-export` / `db-import` through the api: the dump downloads to
// the browser, and an uploaded one replaces the site's database -- or,
// with only some of its tables checked, just those tables.
// The import's steps as a checklist -- done, running, still to come --
// with the running one's percentage and table, and the time so far, so a
// long import visibly moves.
function ImportProgress({ progress }) {
  const { steps, current, pct, table, startedAt } = progress;
  const [now, setNow] = useState(Date.now());
  const ref = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Shown right after the confirmation closes, maybe below the fold of a
  // long table list: bring it into view so the steps are what you watch.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, []);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const percent = pct === null ? null : `${Math.round(pct * 100)}%`;
  const detail = [percent, current === 1 ? table : null].filter(Boolean).join(' · ');
  return (
    <div className="import-progress" aria-live="polite" ref={ref}>
      <ol className="import-steps">
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'pending';
          const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? Loader2 : Circle;
          return (
            <li key={label} className={`import-step is-${state}`}>
              <Icon size={15} className={state === 'current' ? 'spin' : undefined} />
              <span>{label}</span>
              {state === 'current' && detail && <span className="import-step-detail mono">{detail}</span>}
            </li>
          );
        })}
      </ol>
      <div className="progress" role="progressbar" aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}>
        <div className={`progress-bar${pct === null ? ' is-indeterminate' : ''}`} style={pct === null ? undefined : { width: `${pct * 100}%` }} />
        <span className="progress-label">
          Step {current + 1} of {steps.length} · {steps[current]}
          {percent ? ` · ${percent}` : '…'}
          <span className="progress-elapsed mono">{elapsed}</span>
        </span>
      </div>
    </div>
  );
}

// The Export section's download formats; the choice is kept per browser.
const EXPORT_FORMAT_KEY = 'wpdev.exportFormat';
const EXPORT_FORMATS = [
  { value: 'sql.gz', label: '.sql.gz', hint: 'Gzipped SQL: several times smaller; imports here and in most tools.' },
  { value: 'gz', label: 'UpdraftPlus .gz', hint: 'Gzipped SQL named like an UpdraftPlus database backup, so its "Upload backup files" takes it.' },
  { value: 'sql', label: '.sql', hint: 'Plain SQL: bigger, but opens in any text editor.' },
];

function DatabaseTab({ site }) {
  const toast = useToast();
  const url = siteUrl(site.domain);

  // --- export ---
  const [tables, setTables] = useState(null); // [{name, rows, bytes}]
  const [tablesError, setTablesError] = useState(null);
  const [exportSel, setExportSel] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  // .sql.gz or .sql, remembered in this browser.
  const [exportFormat, setExportFormatState] = useState(() => {
    try {
      const saved = localStorage.getItem(EXPORT_FORMAT_KEY);
      return EXPORT_FORMATS.some((f) => f.value === saved) ? saved : 'sql.gz';
    } catch {
      return 'sql.gz';
    }
  });
  const setExportFormat = (f) => {
    setExportFormatState(f);
    try {
      localStorage.setItem(EXPORT_FORMAT_KEY, f);
    } catch {
      // Private window or blocked storage: it just isn't remembered.
    }
  };

  useEffect(() => {
    api
      .dbTables(site.name)
      .then((r) => {
        setTables(r.tables);
        setExportSel(new Set(r.tables.map((t) => t.name)));
      })
      .catch((e) => setTablesError(stripAnsi(e.data?.stderr || e.message)));
  }, [site.name]);

  // After a restore or import the site's tables may differ: new ones
  // start checked, ones still there keep their checkmark.
  const refreshTables = () =>
    api
      .dbTables(site.name)
      .then((r) => {
        setTables((prev) => {
          const before = new Set((prev || []).map((t) => t.name));
          setExportSel((sel) => new Set(r.tables.map((t) => t.name).filter((n) => sel.has(n) || !before.has(n))));
          return r.tables;
        });
      })
      .catch(() => {});

  const exportAll = tables && exportSel.size === tables.length;

  const exportDb = async () => {
    setExporting(true);
    try {
      const { size, filename } = await api.dbExport(site.name, exportAll || !tables ? undefined : [...exportSel], exportFormat);
      toast({ tone: 'success', title: 'Database exported', description: `${filename}, ${formatBytes(size)}` });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Export failed',
        description: stripAnsi(e.data?.stderr || e.data?.stdout || e.message).trim().split('\n').pop(),
        duration: 8000,
      });
    } finally {
      setExporting(false);
    }
  };

  // --- import ---
  const [file, setFile] = useState(null);
  // The dump's tables, read from the file in the browser: null while
  // reading (scanProgress says how far), [] if it names none.
  const [dumpTablesList, setDumpTablesList] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [importSel, setImportSel] = useState(new Set());
  const [rewriteUrls, setRewriteUrls] = useState(true);
  const [confirmImport, setConfirmImport] = useState(false);
  // null when idle; else {steps, current, pct, table, startedAt}: steps
  // are the labels (the upload, then wpdev's own), current the index of
  // the running one, pct 0..1 or null when that step can't say, table the
  // one being loaded.
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const importing = progress !== null;
  const scanning = file && !dumpTablesList && !scanError;

  useEffect(() => {
    if (!file) return undefined;
    const controller = new AbortController();
    setDumpTablesList(null);
    setScanError(null);
    setScanProgress(0);
    dumpTables(file, { onProgress: setScanProgress, signal: controller.signal })
      .then((found) => {
        setDumpTablesList(found);
        setImportSel(new Set(found.map((t) => t.name)));
      })
      .catch((e) => e.name !== 'AbortError' && setScanError(e.message || 'unreadable file'));
    return () => controller.abort();
  }, [file]);

  // Every table checked (or a dump whose tables couldn't be listed) is the
  // old whole-database replace; some checked replaces just those.
  const importAll = !dumpTablesList?.length || importSel.size === dumpTablesList.length;
  const canImport = file && !importing && !scanning && (importAll || importSel.size > 0);

  const importDb = async () => {
    setConfirmImport(false);
    setResult(null);
    const steps = ['Upload the dump', 'Import tables', 'Flush the cache'];
    if (rewriteUrls) steps.push('Re-point URLs');
    setProgress({ steps, current: 0, pct: 0, table: null, startedAt: Date.now() });
    try {
      const r = await api.dbImport(site.name, file, {
        tables: importAll ? undefined : [...importSel],
        rewriteUrls,
        // All sent means wpdev has it; its first [STEP] line follows.
        onUpload: (pct) => setProgress((p) => (pct < 1 ? { ...p, pct } : { ...p, current: 1, pct: 0 })),
        onLine: ({ line }) => {
          const text = stripAnsi(line);
          const pct = /^PROGRESS (\d+)$/.exec(text);
          if (pct) return setProgress((p) => ({ ...p, pct: Math.min(Number(pct[1]), 100) / 100 }));
          const table = /^TABLE (\S+)$/.exec(text);
          if (table) return setProgress((p) => ({ ...p, table: table[1] }));
          const step = /\[STEP\]\s+(\d+)\/\d+\s/.exec(text);
          if (step) {
            const current = Number(step[1]);
            setProgress((p) => ({ ...p, current, pct: current === 1 ? 0 : null, table: null }));
          }
        },
      });
      setResult(r.stdout);
      setFile(null);
      setDumpTablesList(null);
      toast({ tone: 'success', title: 'Database imported', description: site.domain });
      refreshTables();
    } catch (e) {
      setResult([e.data?.stdout, e.data?.stderr].filter(Boolean).join('\n') || e.message);
      toast({ tone: 'error', title: 'Import failed', description: 'See the output below.' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="tab-panel">
      <BackupsSection site={site} onRestored={refreshTables} />

      <section className="panel-section">
        <h4>Export</h4>
        <p className="muted">Download this site's database, or just the tables you check, as an SQL dump.</p>
        {tablesError && <p className="error">Couldn't list the tables: {tablesError}</p>}
        {!tables && !tablesError && <Skeleton height={120} />}
        {tables && <TablePicker tables={tables} selected={exportSel} onChange={setExportSel} disabled={exporting} />}
        <div className="export-row">
          <div className="format-toggle" role="radiogroup" aria-label="File type">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={exportFormat === f.value}
                className={exportFormat === f.value ? 'is-active' : undefined}
                disabled={exporting}
                onClick={() => setExportFormat(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={exportDb} disabled={exporting || (tables && exportSel.size === 0)}>
            <Download size={15} />{' '}
            {exporting ? 'Exporting…' : exportAll || !tables ? 'Download' : `Download ${exportSel.size} table${exportSel.size === 1 ? '' : 's'}`}
          </button>
        </div>
        <p className="field-hint export-hint">
          {EXPORT_FORMATS.find((f) => f.value === exportFormat).hint} Saved as{' '}
          <code>{exportFileName(site.name, exportFormat, '<random>')}</code>
        </p>
      </section>

      <section className="panel-section">
        <h4>Import</h4>
        <p className="muted">
          Replace this site's database with a <code>.sql</code> or <code>.sql.gz</code> dump, for example one from production
          or an UpdraftPlus database backup (<code>…-db.gz</code>). Its tables are listed once the file is read: uncheck
          any to keep this site's own. Nothing replaced is saved first: export it above, or take a snapshot.
        </p>
        <label className={`file-pick${file ? ' has-file' : ''}${importing ? ' is-disabled' : ''}`}>
          <input
            type="file"
            accept=".sql,.gz,application/sql,application/gzip"
            disabled={importing}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setResult(null);
              e.target.value = '';
            }}
          />
          <FileUp size={18} />
          {file ? (
            <span className="file-pick-text">
              <strong className="mono">{file.name}</strong>
              <span>{formatBytes(file.size)}</span>
            </span>
          ) : (
            <span className="file-pick-text">
              <strong>Choose a dump</strong>
              <span>.sql, .sql.gz or UpdraftPlus -db.gz, up to 2 GB</span>
            </span>
          )}
        </label>
        {scanning && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round((scanProgress || 0) * 100)}>
            <div className="progress-bar" style={{ width: `${(scanProgress || 0) * 100}%` }} />
            <span className="progress-label">Reading the dump's tables… {Math.round((scanProgress || 0) * 100)}%</span>
          </div>
        )}
        {scanError && (
          <p className="field-hint field-hint-error">
            Couldn't list this file's tables ({scanError}). If it's a .sql or gzipped dump, it can still be
            imported whole.
          </p>
        )}
        {dumpTablesList && dumpTablesList.length === 0 && (
          <p className="field-hint field-hint-icon">
            <Info size={13} /> No <code>CREATE TABLE</code> statements found, so the tables can't be listed; the dump is
            imported whole.
          </p>
        )}
        {dumpTablesList?.length > 0 && (
          <TablePicker
            tables={dumpTablesList}
            selected={importSel}
            onChange={setImportSel}
            disabled={importing}
            sizeLabel="≈ "
          />
        )}
        <label className="check">
          <input type="checkbox" checked={rewriteUrls} disabled={importing} onChange={(e) => setRewriteUrls(e.target.checked)} />
          <span>
            Re-point the dump's URLs to <code>{url}</code>
            <span className="field-hint">
              {' '}
              Reads the dump's home URL and search-replaces it{importAll ? '' : ' in the imported tables'}, so a production
              dump works here.
            </span>
          </span>
        </label>
        {importing && <ImportProgress progress={progress} />}
        <div className="button-row">
          <button type="button" className="btn btn-danger" disabled={!canImport} onClick={() => setConfirmImport(true)}>
            <Upload size={15} />{' '}
            {importAll ? 'Import and replace' : `Import ${importSel.size} table${importSel.size === 1 ? '' : 's'}`}
          </button>
        </div>
        {result && <Output>{stripAnsi(result)}</Output>}
      </section>

      {confirmImport && (
        <TypeToConfirmDialog
          title={importAll ? `Replace ${site.domain}'s database?` : `Replace ${importSel.size} of ${site.domain}'s tables?`}
          message={
            importAll
              ? `Everything in it is replaced by ${file.name}. The current database isn't saved first.`
              : `${[...importSel].join(', ')} ${importSel.size === 1 ? 'is' : 'are'} replaced by ${file.name}'s; the site's other tables are kept. The replaced ones aren't saved first.`
          }
          expected={site.domain}
          confirmLabel={importAll ? 'Replace database' : 'Replace tables'}
          onCancel={() => setConfirmImport(false)}
          onConfirm={importDb}
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
  // wpdev gives the clone the source's suffix: shop.local -> copy.local.
  const suffix = site.domain.slice(site.domain.lastIndexOf('.'));

  const clone = () => {
    setConfirmClone(false);
    const trimmed = newName.trim();
    if (!trimmed) return;
    onRunAction({
      title: `Clone ${site.domain} -> ${trimmed}${suffix}`,
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
          <span className="mono">{suffix}</span>
        </div>
        <button className="btn btn-primary" disabled={!newName.trim()} onClick={() => setConfirmClone(true)}>
          <Copy size={15} /> Clone
        </button>
      </div>
      {confirmClone && (
        <ConfirmDialog
          title="Clone this site?"
          message={`Creates sites/${newName.trim()} and ${siteUrl(`${newName.trim()}${suffix}`)} as a full copy of ${site.domain} (files + database).`}
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
      {output && <Output>{output}</Output>}
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
          settings. There is no undo (snapshots and database backups are not touched).
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
