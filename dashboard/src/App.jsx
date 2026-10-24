import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Settings2,
  ArrowUpRight,
  Play,
  RotateCw,
  Square,
  Sun,
  Moon,
  Plus,
  RefreshCw,
  KeyRound,
  Sparkles,
  ScrollText,
  Info,
  Bug,
} from 'lucide-react';
import { api, getToken, setToken, siteUrl, streamSSE } from './api';
import { parseDoctor, parseServices, parseSites, parseStatusSites, stripAnsi } from './lib/parse';
import Sidebar, { PAGES, TOOLS } from './components/Sidebar';
import Topbar from './components/Topbar';
import CommandPalette from './components/CommandPalette';
import { OverviewPage, SitesPage, ServicesPage, DoctorPage } from './components/pages';
import { serviceInfo, restartImpact } from './lib/services';
import AddSiteDialog from './components/AddSiteDialog';
import SiteManageDialog from './components/SiteManageDialog';
import UpdateDialog from './components/UpdateDialog';
import DebugPage from './components/DebugPage';
import { PowerContext, SharesContext } from './components/SiteCard';
import LogModal, { LogsDrawer } from './components/LogModal';
import ConfirmDialog from './components/ConfirmDialog';
import DocsPage from './components/DocsPage';
import DockerPage from './components/DockerPage';
import ContainerDetails from './components/ContainerDetails';
import { Modal, ModalHeader, useToast } from './components/ui';
import { currentEffectiveTheme, setTheme } from './theme';

const PAGE_META = {
  overview: { title: 'Overview', subtitle: 'Your local WordPress stack at a glance' },
  sites: { title: 'Sites', subtitle: 'Provision, open and manage every site' },
  services: { title: 'Services', subtitle: 'The containers behind every site' },
  docker: { title: 'Docker', subtitle: 'Resource use, images and volumes of this stack' },
  doctor: { title: 'Doctor', subtitle: 'Find and explain anything misconfigured' },
  debug: { title: 'Debug', subtitle: "WordPress's debug settings and debug.log, site by site" },
  docs: { title: 'Docs', subtitle: 'The README, searchable' },
};

const STACK_CONFIRM = {
  restart: {
    title: 'Restart the stack?',
    message: 'Every container restarts. All sites will be briefly unreachable.',
    confirmLabel: 'Restart',
  },
  down: {
    title: 'Stop the stack?',
    message: 'Every container stops. Sites stay unreachable until you run Up again (no data is deleted).',
    confirmLabel: 'Stop',
    danger: true,
  },
};

// The last `wpdev status` this browser saw, so a reload shows real data
// (with its "checked at" time) straight away while a fresh one runs --
// status takes seconds, and the Overview and Services pages are built
// from it.
const STATUS_CACHE_KEY = 'wpdev_status_cache';

function statusFrom(raw, checkedAt, loading = false) {
  return { raw, sites: parseStatusSites(raw) || [], services: parseServices(raw), checkedAt, loading };
}

function cachedStatus() {
  try {
    const cached = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || 'null');
    if (cached?.raw) return statusFrom(cached.raw, new Date(cached.at), true);
  } catch {
    /* missing or unreadable -- start empty */
  }
  return { raw: null, sites: [], services: null, checkedAt: null, loading: false };
}

// #/<page>[/<sub>]: the page, and for some (debug) which site it shows.
function hashParts() {
  const [id, sub = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { id, sub: sub ? decodeURIComponent(sub) : null };
}

function pageFromHash() {
  const { id } = hashParts();
  return PAGE_META[id] ? id : 'overview';
}

export default function App() {
  const toast = useToast();
  const [page, setPage] = useState(pageFromHash);
  const [pageSub, setPageSub] = useState(() => hashParts().sub);
  const [theme, setThemeState] = useState(currentEffectiveTheme());
  const [health, setHealth] = useState('checking');
  const [sites, setSites] = useState(null); // null until the first `wpdev list` answers
  const [sitesError, setSitesError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  // `wpdev status`: the container table plus a per-site row (WP/MySQL
  // versions, HTTP, database, cache). Heavier than `list` -- it runs a
  // real `wp core version` per site -- so it isn't on the 15s poll; it
  // refreshes on load, on an explicit refresh, and after every action.
  const [status, setStatus] = useState(cachedStatus);
  const [doctor, setDoctor] = useState({ loading: false, result: null, raw: null, error: null, ranAt: null });
  const [updateInfo, setUpdateInfo] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [manageSite, setManageSite] = useState(null);
  const [manageTab, setManageTab] = useState('Overview');
  const openManage = useCallback((site, tab = 'Overview') => {
    setManageTab(tab);
    setManageSite(site);
  }, []);
  const [sharesByDomain, setSharesByDomain] = useState({});
  const [logsFor, setLogsFor] = useState(null);
  const [detailsFor, setDetailsFor] = useState(null); // service name
  const [log, setLog] = useState(null); // {title, request, onFinished}
  const [stackBusy, setStackBusy] = useState(null);
  const [confirmStack, setConfirmStack] = useState(null);
  const [showUpdates, setShowUpdates] = useState(false);
  const [confirmServiceRestart, setConfirmServiceRestart] = useState(null); // service name
  const [restarting, setRestarting] = useState([]); // service names mid-restart

  // --- navigation (hash-based, so a reload or bookmark keeps the page) ---
  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash());
      setPageSub(hashParts().sub);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((id, sub = null) => {
    window.location.hash = sub ? `/${id}/${encodeURIComponent(sub)}` : `/${id}`;
    setPage(id);
    setPageSub(sub);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    document.title = page === 'overview' ? 'wp-local-dev' : `${PAGE_META[page].title} · wp-local-dev`;
  }, [page]);

  // --- data ---
  const refresh = useCallback(() => {
    api
      .shares()
      .then((r) => setSharesByDomain(Object.fromEntries(r.shares.map((s) => [s.domain, s]))))
      .catch(() => {});
    api
      .health()
      .then(() => setHealth('ok'))
      .catch(() => setHealth('down'));
    api
      .sites()
      .then((r) => {
        setSites(parseSites(r.stdout));
        setSitesError(null);
      })
      .catch((e) => setSitesError(e.message));
    api
      .systemStats()
      .then((r) => {
        setStats(r);
        setStatsError(null);
      })
      .catch((e) => setStatsError(e.message));
  }, []);

  const refreshStatus = useCallback(() => {
    setStatus((s) => ({ ...s, loading: true }));
    api
      .status()
      .catch((e) => e.data || { stdout: '' }) // status exits non-zero when something's down; its table is still the answer
      .then((r) => {
        const out = r.stdout || '';
        setStatus(statusFrom(out, new Date()));
        try {
          localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ raw: out, at: Date.now() }));
        } catch {
          /* per-viewer convenience only */
        }
      });
  }, []);

  // Status isn't polled, so a snapshot taken while MySQL was still starting
  // (right after an up or restart) would stick until the next action.
  // Check again shortly, until it has settled one way or the other.
  const mysqlStarting = !status.loading && status.sites.some((s) => s.database === 'starting');
  useEffect(() => {
    if (!mysqlStarting) return undefined;
    const id = setTimeout(refreshStatus, 5000);
    return () => clearTimeout(id);
  }, [mysqlStarting, status.checkedAt, refreshStatus]);

  // A site's HTTP status changes on its own (a plugin fatal fixed, PHP
  // restarted), so re-check every minute while the tab is visible, and
  // right away on coming back to it if the last check is stale. Without
  // this an old "HTTP 500" stayed on the card until the next reload.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    const STALE_MS = 60 * 1000;
    const recheck = () => {
      const s = statusRef.current;
      if (document.hidden || s.loading) return;
      if (s.checkedAt && Date.now() - s.checkedAt.getTime() < STALE_MS - 1000) return;
      refreshStatus();
    };
    const id = setInterval(recheck, STALE_MS);
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [refreshStatus]);

  // Streamed, so each check shows up as doctor prints it rather than a
  // blank page for the whole run. Doctor exits non-zero when it finds
  // problems -- that output is still the result, not an error.
  const doctorAbort = useRef(null);
  const runDoctor = useCallback(() => {
    doctorAbort.current?.();
    const lines = [];
    setDoctor((d) => ({ ...d, loading: true, error: null, result: null, raw: null }));
    doctorAbort.current = streamSSE('GET', '/api/doctor/stream', undefined, {
      onLine: ({ stream, line }) => {
        if (stream !== 'stdout') return;
        lines.push(line);
        const raw = lines.join('\n');
        setDoctor((d) => ({ ...d, raw, result: parseDoctor(raw) }));
      },
      onDone: () => {
        const raw = lines.join('\n');
        setDoctor({ loading: false, result: parseDoctor(raw), raw, error: null, ranAt: new Date() });
      },
      onError: (e) => setDoctor((d) => ({ ...d, loading: false, error: e.message })),
    });
  }, []);

  useEffect(() => () => doctorAbort.current?.(), []);

  // Checks git's upstream, not GitHub's release API -- the right signal
  // for "does `wpdev update` have anything to do". The api caches it
  // (re-checking every 6 hours), so asking is cheap. Best-effort.
  const checkForUpdate = useCallback((fresh = false) => {
    api.updateCheck(fresh).then(setUpdateInfo).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshStatus();
    checkForUpdate();
    const id = setInterval(refresh, 15000);
    // A dashboard left open for days still hears about a release.
    const updates = setInterval(checkForUpdate, 30 * 60 * 1000);
    return () => {
      clearInterval(id);
      clearInterval(updates);
    };
  }, [refresh, refreshStatus, checkForUpdate]);

  useEffect(() => {
    if (page === 'doctor' && !doctor.result && !doctor.loading) runDoctor();
  }, [page, doctor.result, doctor.loading, runDoctor]);

  const refreshAll = useCallback(() => {
    refresh();
    refreshStatus();
    checkForUpdate();
    if (page === 'doctor') runDoctor();
  }, [refresh, refreshStatus, checkForUpdate, page, runDoctor]);

  // After a site is switched on or off: the list says so right away, the
  // status table (HTTP, Redis) after its checks.
  const onPowerChanged = useCallback(() => {
    refresh();
    refreshStatus();
  }, [refresh, refreshStatus]);

  const siteList = useMemo(() => sites || [], [sites]);
  const statusBySite = useMemo(() => Object.fromEntries(status.sites.map((r) => [r.domain, r])), [status.sites]);

  // --- actions ---
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }, [theme]);

  const openTool = useCallback(
    async (which, site) => {
      // Open the tab synchronously (inside the click) so the browser
      // doesn't treat it as a popup, then point it at wpdev's URL.
      const win = window.open('about:blank', '_blank');
      try {
        const r = await api.links[which](site);
        const out = stripAnsi(r.stdout);
        const match = /Opening (\S+)/.exec(out);
        if (match && win) {
          win.location.href = match[1];
          // wpdev's own warnings matter more than the login hint.
          const warnings = out.split('\n').filter((l) => l.startsWith('⚠')).map((l) => l.slice(1).trim());
          const note = /Login: (.+)/.exec(out);
          if (warnings.length) toast({ tone: 'warning', title: `Opened ${which}`, description: warnings.join(' '), duration: 9000 });
          else if (note) toast({ tone: 'info', title: `Opened ${which}`, description: note[1] });
        } else {
          win?.close();
          toast({ tone: 'warning', title: `Couldn't open ${which}`, description: (r.stdout || '').trim() });
        }
      } catch (e) {
        win?.close();
        toast({ tone: 'error', title: `Couldn't open ${which}`, description: e.message });
      }
    },
    [toast],
  );

  const runStackAction = useCallback(
    async (action) => {
      setStackBusy(action);
      const label = { up: 'Stack started', restart: 'Stack restarted', down: 'Stack stopped' }[action];
      try {
        if (action === 'up') await api.stackUp();
        else if (action === 'down') await api.stackDown();
        else await api.stackRestart();
        toast({ tone: 'success', title: label });
      } catch (e) {
        toast({ tone: 'error', title: `wpdev ${action} failed`, description: stripAnsi(e.data?.stdout).trim().split('\n').pop() || e.message });
      } finally {
        setStackBusy(null);
        refresh();
        refreshStatus();
      }
    },
    [toast, refresh, refreshStatus],
  );

  const restartService = useCallback(
    async (service) => {
      const { label } = serviceInfo(service);
      setRestarting((list) => [...list, service]);
      try {
        const r = await api.restartService(service);
        // The api can't restart itself in-process; wpdev hands it to a
        // helper that does it a few seconds after this response.
        const deferred = /restarts itself/.test(r.stdout || '');
        toast({
          tone: 'success',
          title: deferred ? `${label} restarts in a few seconds` : `${label} restarted`,
          description: deferred ? 'The dashboard reconnects on its own.' : undefined,
        });
      } catch (e) {
        toast({ tone: 'error', title: `Couldn't restart ${label}`, description: stripAnsi(e.data?.stdout || e.message).trim().split('\n').pop() });
      } finally {
        setRestarting((list) => list.filter((s) => s !== service));
        refreshStatus();
      }
    },
    [toast, refreshStatus],
  );

  const requestStackAction = useCallback(
    (action) => (action === 'up' ? runStackAction('up') : setConfirmStack(action)),
    [runStackAction],
  );

  const startAdd = ({ domain, php, wpVersion }) => {
    setShowAdd(false);
    setLog({
      title: `Add ${domain}`,
      request: { method: 'POST', path: '/api/sites', body: { domain, php, wpVersion } },
      onFinished: (code) => {
        refresh();
        refreshStatus();
        if (code === 0) toast({ tone: 'success', title: `${domain} is ready`, description: siteUrl(domain) });
      },
    });
  };

  const startUpdate = () => {
    setLog({
      title: 'wpdev update',
      request: { method: 'POST', path: '/api/stack/update' },
      onFinished: () => {
        refresh();
        refreshStatus();
        // Check now, not the api's cached answer from before the pull. Again
        // a bit later: the api may restart itself right after an update and
        // miss the first one.
        checkForUpdate(true);
        setTimeout(() => checkForUpdate(true), 15000);
      },
    });
  };

  const runAction = ({ title, request, onFinished }) => {
    setManageSite(null);
    setLog({
      title,
      request,
      onFinished: (code) => {
        onFinished?.(code);
        refresh();
        refreshStatus();
      },
    });
  };

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo(() => {
    const list = [];
    PAGES.forEach((p) =>
      list.push({ id: `go-${p.id}`, group: 'Go to', label: p.label, icon: p.icon, keywords: 'page navigate', run: () => navigate(p.id) }),
    );
    list.push({ id: 'add-site', group: 'Sites', label: 'Add a new site', icon: Plus, keywords: 'create provision new', run: () => setShowAdd(true) });
    siteList.forEach((s) => {
      list.push({ id: `manage-${s.name}`, group: 'Sites', label: `Manage ${s.domain}`, icon: Settings2, hint: 'settings', keywords: s.name, run: () => openManage(s) });
      list.push({ id: `debug-${s.name}`, group: 'Sites', label: `Debug log for ${s.domain}`, icon: Bug, hint: 'debug.log', keywords: `${s.name} errors php warnings`, run: () => navigate('debug', s.name) });
      list.push({ id: `visit-${s.name}`, group: 'Sites', label: `Visit ${s.domain}`, icon: Globe, hint: 'new tab', keywords: s.name, run: () => window.open(siteUrl(s.domain), '_blank') });
      list.push({ id: `admin-${s.name}`, group: 'Sites', label: `wp-admin for ${s.domain}`, icon: ArrowUpRight, hint: 'new tab', keywords: `${s.name} dashboard login`, run: () => window.open(`${siteUrl(s.domain)}/wp-admin/`, '_blank') });
    });
    list.push({ id: 'stack-up', group: 'Stack', label: 'Start the stack', icon: Play, hint: 'wpdev up', run: () => requestStackAction('up') });
    list.push({ id: 'stack-restart', group: 'Stack', label: 'Restart the stack', icon: RotateCw, hint: 'wpdev restart', run: () => requestStackAction('restart') });
    list.push({ id: 'stack-down', group: 'Stack', label: 'Stop the stack', icon: Square, hint: 'wpdev down', danger: true, run: () => requestStackAction('down') });
    if (updateInfo?.updateAvailable) {
      list.push({ id: 'stack-update', group: 'Stack', label: 'Update wp-local-dev', icon: Sparkles, hint: 'wpdev update', run: () => setShowUpdates(true) });
    }
    list.push({ id: 'stack-update-check', group: 'Stack', label: 'Check for updates', icon: RotateCw, hint: 'wpdev update-check', keywords: 'version release upgrade', run: () => setShowUpdates(true) });
    (status.services || []).forEach((svc) => {
      const { label } = serviceInfo(svc.service);
      list.push({ id: `restart-${svc.service}`, group: 'Services', label: `Restart ${label}`, icon: RotateCw, hint: `wpdev restart ${svc.service}`, keywords: svc.service, run: () => setConfirmServiceRestart(svc.service) });
      list.push({ id: `logs-${svc.service}`, group: 'Services', label: `${label} logs`, icon: ScrollText, hint: 'live', keywords: `${svc.service} tail`, run: () => setLogsFor(svc.service) });
      list.push({ id: `details-${svc.service}`, group: 'Services', label: `${label} details`, icon: Info, hint: 'inspect', keywords: `${svc.service} inspect env mounts ports`, run: () => setDetailsFor(svc.service) });
    });
    TOOLS.forEach((t) => list.push({ id: `tool-${t.id}`, group: 'Tools', label: `Open ${t.label}`, icon: t.icon, hint: 'new tab', run: () => openTool(t.id) }));
    list.push({ id: 'refresh', group: 'Preferences', label: 'Refresh everything', icon: RefreshCw, run: refreshAll });
    list.push({ id: 'theme', group: 'Preferences', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? Sun : Moon, run: toggleTheme });
    list.push({ id: 'settings', group: 'Preferences', label: 'API settings', icon: KeyRound, keywords: 'token', run: () => setShowSettings(true) });
    return list;
  }, [siteList, status.services, navigate, openManage, requestStackAction, updateInfo, openTool, refreshAll, theme, toggleTheme]);

  const meta = PAGE_META[page];

  return (
    <SharesContext.Provider value={sharesByDomain}>
    <PowerContext.Provider value={onPowerChanged}>
    <div className={`shell${page === 'docs' ? ' shell-docs' : ''}`}>
      <Sidebar
        page={page}
        onNavigate={navigate}
        counts={{ sites: siteList.length || null }}
        onOpenTool={openTool}
        onOpenSettings={() => setShowSettings(true)}
        updateInfo={updateInfo}
        onUpdate={() => setShowUpdates(true)}
        open={menuOpen}
        onDismiss={() => setMenuOpen(false)}
      />

      <div className="main">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          health={health}
          stackBusy={stackBusy}
          onStackAction={requestStackAction}
          onRefresh={refreshAll}
          refreshing={status.loading}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />

        {health === 'down' && (
          <div className="banner banner-danger">
            <strong>Can't reach the wpdev API at {api.base()}.</strong> Is the stack running? Start it with <code>wpdev up</code>, or
            check the API token in settings.
          </div>
        )}
        {sitesError && health !== 'down' && <div className="banner banner-danger">{sitesError}</div>}

        <main className="content" key={page}>
          {page === 'overview' && (
            <OverviewPage
              sites={siteList}
              sitesLoading={sites === null}
              statusBySite={statusBySite}
              services={status.services}
              status={status}
              stats={stats}
              statsError={statsError}
              onManage={openManage}
              onAdd={() => setShowAdd(true)}
              onNavigate={navigate}
              onOpenTool={openTool}
            />
          )}
          {page === 'sites' && <SitesPage sites={siteList} sitesLoading={sites === null} statusBySite={statusBySite} onManage={openManage} onAdd={() => setShowAdd(true)} />}
          {page === 'services' && (
            <ServicesPage
              sites={siteList}
              services={status.services}
              status={status}
              onOpenTool={openTool}
              onShowLogs={setLogsFor}
              onRefresh={refreshStatus}
              onRestart={setConfirmServiceRestart}
              onShowDetails={setDetailsFor}
              restarting={restarting}
            />
          )}
          {page === 'docker' && <DockerPage onShowDetails={setDetailsFor} />}
          {page === 'doctor' && <DoctorPage doctor={doctor} onRun={runDoctor} />}
          {page === 'debug' && <DebugPage sites={sites === null ? null : siteList} siteName={pageSub} onSelectSite={(name) => navigate('debug', name)} />}
          {page === 'docs' && <DocsPage />}
        </main>
      </div>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {showAdd && (
        <AddSiteDialog
          runningPhp={(status.services || []).filter((s) => s.state === 'running').map((s) => s.service)}
          onSubmit={startAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {manageSite && (
        <SiteManageDialog
          site={manageSite}
          initialTab={manageTab}
          onOpenTool={openTool}
          onOpenDebug={(s) => {
            setManageSite(null);
            navigate('debug', s.name);
          }}
          onClose={() => {
            setManageSite(null);
            refresh();
          }}
          onRunAction={runAction}
          onRemoved={() => {
            setManageSite(null);
            refreshAll();
          }}
        />
      )}

      {detailsFor && <ContainerDetails service={detailsFor} onClose={() => setDetailsFor(null)} />}

      {logsFor && <LogsDrawer service={logsFor} label={serviceInfo(logsFor).label} onClose={() => setLogsFor(null)} />}

      {log && <LogModal title={log.title} request={log.request} onFinished={log.onFinished} onClose={() => setLog(null)} />}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} onSaved={refreshAll} />}

      {confirmStack && (
        <ConfirmDialog
          {...STACK_CONFIRM[confirmStack]}
          onCancel={() => setConfirmStack(null)}
          onConfirm={() => {
            const action = confirmStack;
            setConfirmStack(null);
            runStackAction(action);
          }}
        />
      )}

      {confirmServiceRestart && (
        <ConfirmDialog
          title={`Restart ${serviceInfo(confirmServiceRestart).label}?`}
          message={`Stops and starts ${confirmServiceRestart} (wpdev restart ${confirmServiceRestart}). ${restartImpact(confirmServiceRestart)}`}
          confirmLabel="Restart"
          onCancel={() => setConfirmServiceRestart(null)}
          onConfirm={() => {
            const service = confirmServiceRestart;
            setConfirmServiceRestart(null);
            restartService(service);
          }}
        />
      )}

      {showUpdates && (
        <UpdateDialog
          info={updateInfo}
          onCheck={() => api.updateCheck(true).then(setUpdateInfo)}
          onClose={() => setShowUpdates(false)}
          onUpdate={() => {
            setShowUpdates(false);
            startUpdate();
          }}
        />
      )}
    </div>
    </PowerContext.Provider>
    </SharesContext.Provider>
  );
}

function SettingsDialog({ onClose, onSaved }) {
  const [token, setTokenInput] = useState(getToken());
  const toast = useToast();

  return (
    <Modal
      onClose={onClose}
      size="md"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        setToken(token);
        onClose();
        onSaved();
        toast({ tone: 'success', title: 'Settings saved' });
      }}
    >
      <ModalHeader icon={KeyRound} title="API settings" subtitle="How this dashboard reaches the wpdev API" onClose={onClose} />
      <div className="modal-body">
        <label className="field">
          <span className="field-label">API base</span>
          <input name="apiBase" readOnly value={api.base()} />
          <span className="field-hint">From API_PORT in .env.</span>
        </label>
        <label className="field">
          <span className="field-label">API token</span>
          <input
            name="apiToken"
            type="password"
            placeholder="only if API_TOKEN is set in .env"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <span className="field-hint">Kept in this browser only.</span>
        </label>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </div>
    </Modal>
  );
}
