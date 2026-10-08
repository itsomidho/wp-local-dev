import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { api, getToken, setToken, siteUrl } from './api';
import { parseDoctor, parseServices, parseSites, parseStatusSites } from './lib/parse';
import Sidebar, { PAGES, TOOLS } from './components/Sidebar';
import Topbar from './components/Topbar';
import CommandPalette from './components/CommandPalette';
import { OverviewPage, SitesPage, ServicesPage, DoctorPage } from './components/pages';
import { serviceInfo } from './lib/services';
import AddSiteDialog from './components/AddSiteDialog';
import SiteManageDialog from './components/SiteManageDialog';
import LogModal, { LogsDrawer } from './components/LogModal';
import ConfirmDialog from './components/ConfirmDialog';
import DocsPage from './components/DocsPage';
import { Modal, ModalHeader, useToast } from './components/ui';
import { currentEffectiveTheme, setTheme } from './theme';

const PAGE_META = {
  overview: { title: 'Overview', subtitle: 'Your local WordPress stack at a glance' },
  sites: { title: 'Sites', subtitle: 'Provision, open and manage every site' },
  services: { title: 'Services', subtitle: 'The containers behind every site' },
  doctor: { title: 'Doctor', subtitle: 'Find and explain anything misconfigured' },
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

function pageFromHash() {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGE_META[id] ? id : 'overview';
}

export default function App() {
  const toast = useToast();
  const [page, setPage] = useState(pageFromHash);
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
  const [status, setStatus] = useState({ raw: null, sites: [], services: null, checkedAt: null, loading: false });
  const [doctor, setDoctor] = useState({ loading: false, result: null, raw: null, error: null, ranAt: null });
  const [updateInfo, setUpdateInfo] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [manageSite, setManageSite] = useState(null);
  const [logsFor, setLogsFor] = useState(null);
  const [log, setLog] = useState(null); // {title, request, onFinished}
  const [stackBusy, setStackBusy] = useState(null);
  const [confirmStack, setConfirmStack] = useState(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);

  // --- navigation (hash-based, so a reload or bookmark keeps the page) ---
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((id) => {
    window.location.hash = `/${id}`;
    setPage(id);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    document.title = page === 'overview' ? 'wp-local-dev' : `${PAGE_META[page].title} · wp-local-dev`;
  }, [page]);

  // --- data ---
  const refresh = useCallback(() => {
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
        setStatus({
          raw: out,
          sites: parseStatusSites(out) || [],
          services: parseServices(out),
          checkedAt: new Date(),
          loading: false,
        });
      });
  }, []);

  const runDoctor = useCallback(() => {
    setDoctor((d) => ({ ...d, loading: true, error: null }));
    api
      .doctor()
      .catch((e) => {
        // Doctor exits non-zero when it finds problems -- that output is
        // the result, not an error. Only no output at all is a failure.
        if (e.data?.stdout) return e.data;
        throw e;
      })
      .then((r) => setDoctor({ loading: false, result: parseDoctor(r.stdout), raw: r.stdout, error: null, ranAt: new Date() }))
      .catch((e) => setDoctor((d) => ({ ...d, loading: false, error: e.message })));
  }, []);

  // Checks git's upstream, not GitHub's release API -- the right signal
  // for "does `wpdev update` have anything to do". Best-effort.
  const checkForUpdate = useCallback(() => {
    api.updateCheck().then(setUpdateInfo).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshStatus();
    checkForUpdate();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
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
        const match = /Opening (\S+)/.exec(r.stdout || '');
        if (match && win) {
          win.location.href = match[1];
          const note = /Login: (.+)/.exec(r.stdout || '');
          if (note) toast({ tone: 'info', title: `Opened ${which}`, description: note[1] });
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
        toast({ tone: 'error', title: `wpdev ${action} failed`, description: e.data?.stdout?.trim().split('\n').pop() || e.message });
      } finally {
        setStackBusy(null);
        refresh();
        refreshStatus();
      }
    },
    [toast, refresh, refreshStatus],
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
        checkForUpdate();
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
      list.push({ id: `manage-${s.name}`, group: 'Sites', label: `Manage ${s.domain}`, icon: Settings2, hint: 'settings', keywords: s.name, run: () => setManageSite(s) });
      list.push({ id: `visit-${s.name}`, group: 'Sites', label: `Visit ${s.domain}`, icon: Globe, hint: 'new tab', keywords: s.name, run: () => window.open(siteUrl(s.domain), '_blank') });
      list.push({ id: `admin-${s.name}`, group: 'Sites', label: `wp-admin for ${s.domain}`, icon: ArrowUpRight, hint: 'new tab', keywords: `${s.name} dashboard login`, run: () => window.open(`${siteUrl(s.domain)}/wp-admin/`, '_blank') });
    });
    list.push({ id: 'stack-up', group: 'Stack', label: 'Start the stack', icon: Play, hint: 'wpdev up', run: () => requestStackAction('up') });
    list.push({ id: 'stack-restart', group: 'Stack', label: 'Restart the stack', icon: RotateCw, hint: 'wpdev restart', run: () => requestStackAction('restart') });
    list.push({ id: 'stack-down', group: 'Stack', label: 'Stop the stack', icon: Square, hint: 'wpdev down', danger: true, run: () => requestStackAction('down') });
    if (updateInfo?.updateAvailable) {
      list.push({ id: 'stack-update', group: 'Stack', label: 'Update wp-local-dev', icon: Sparkles, hint: 'wpdev update', run: () => setConfirmUpdate(true) });
    }
    TOOLS.forEach((t) => list.push({ id: `tool-${t.id}`, group: 'Tools', label: `Open ${t.label}`, icon: t.icon, hint: 'new tab', run: () => openTool(t.id) }));
    list.push({ id: 'refresh', group: 'Preferences', label: 'Refresh everything', icon: RefreshCw, run: refreshAll });
    list.push({ id: 'theme', group: 'Preferences', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? Sun : Moon, run: toggleTheme });
    list.push({ id: 'settings', group: 'Preferences', label: 'API settings', icon: KeyRound, keywords: 'token', run: () => setShowSettings(true) });
    return list;
  }, [siteList, navigate, requestStackAction, updateInfo, openTool, refreshAll, theme, toggleTheme]);

  const meta = PAGE_META[page];

  return (
    <div className={`shell${page === 'docs' ? ' shell-docs' : ''}`}>
      <Sidebar
        page={page}
        onNavigate={navigate}
        counts={{ sites: siteList.length || null }}
        onOpenTool={openTool}
        onOpenSettings={() => setShowSettings(true)}
        updateInfo={updateInfo}
        onUpdate={() => setConfirmUpdate(true)}
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
              onManage={setManageSite}
              onAdd={() => setShowAdd(true)}
              onNavigate={navigate}
              onOpenTool={openTool}
            />
          )}
          {page === 'sites' && <SitesPage sites={siteList} sitesLoading={sites === null} statusBySite={statusBySite} onManage={setManageSite} onAdd={() => setShowAdd(true)} />}
          {page === 'services' && (
            <ServicesPage services={status.services} status={status} onOpenTool={openTool} onShowLogs={setLogsFor} onRefresh={refreshStatus} />
          )}
          {page === 'doctor' && <DoctorPage doctor={doctor} onRun={runDoctor} />}
          {page === 'docs' && <DocsPage />}
        </main>
      </div>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {showAdd && <AddSiteDialog onSubmit={startAdd} onClose={() => setShowAdd(false)} />}

      {manageSite && (
        <SiteManageDialog
          site={manageSite}
          onClose={() => setManageSite(null)}
          onRunAction={runAction}
          onRemoved={() => {
            setManageSite(null);
            refreshAll();
          }}
        />
      )}

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

      {confirmUpdate && (
        <ConfirmDialog
          title="Update wp-local-dev?"
          message="Pulls the latest code, rebuilds images, and recreates every container. Sites will be briefly unreachable."
          confirmLabel="Update"
          onCancel={() => setConfirmUpdate(false)}
          onConfirm={() => {
            setConfirmUpdate(false);
            startUpdate();
          }}
        />
      )}
    </div>
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
