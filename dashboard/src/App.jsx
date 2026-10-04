import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import Header from './components/Header';
import MachineStats from './components/MachineStats';
import SitesPanel, { parseSites } from './components/SitesPanel';
import { parseStatusSites } from './components/StatusTable';
import AddSiteDialog from './components/AddSiteDialog';
import SiteManageDialog from './components/SiteManageDialog';
import LogModal from './components/LogModal';
import DocsPage from './components/DocsPage';

export default function App() {
  const [showDocs, setShowDocs] = useState(false);
  const [health, setHealth] = useState('checking');
  const [sites, setSites] = useState([]);
  const [sitesError, setSitesError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [versions, setVersions] = useState({}); // {domain: {wp, mysql}}
  const [showAdd, setShowAdd] = useState(false);
  const [manageSite, setManageSite] = useState(null);
  const [log, setLog] = useState(null); // {title, request, onFinished}
  const [updateInfo, setUpdateInfo] = useState(null); // {updateAvailable, stdout} | null

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

  // Separate from the 15s poll above on purpose: `wpdev status` now runs a
  // real `wp core version` (plus a shared `SELECT VERSION()`) per site, on
  // top of the reachability/db/cache checks it already did -- fine once in
  // a while, not something to re-run every 15s regardless of site count.
  // WP/MySQL versions also only change on an actual core update, not
  // between one poll and the next, so there's nothing lost by refreshing
  // this only on load and whenever the site list itself changes.
  const refreshVersions = useCallback(() => {
    api
      .status()
      .then((r) => {
        const rows = parseStatusSites(r.stdout);
        if (!rows) return;
        const map = {};
        rows.forEach((row) => {
          map[row.domain] = { wp: row.wp, mysql: row.mysql };
        });
        setVersions(map);
      })
      .catch(() => {}); // best-effort -- sites list is the point, not this
  }, []);

  // Checks git's upstream, not GitHub's release API -- consistent with
  // the version badge itself (git describe), and it's also the correct
  // signal for "does `wpdev update` have anything to do", which can be
  // true from new commits alone, tagged release or not. Best-effort: no
  // network, or this checkout predating `wpdev update-check`'s exit-code
  // contract, should never show as a dashboard error.
  const checkForUpdate = useCallback(() => {
    api.updateCheck().then(setUpdateInfo).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshVersions();
    checkForUpdate();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh, refreshVersions, checkForUpdate]);

  // A manual refresh (the header button) is an explicit ask for the whole
  // picture, not a background tick -- it should include versions too, even
  // though the automatic poll deliberately doesn't. Also what actually
  // catches a site created/removed from the CLI rather than this UI, which
  // the action-triggered refreshVersions calls below can't see. Same
  // reasoning extends to the update check -- a `git fetch` on every 15s
  // tick would be wasteful, but an explicit refresh is exactly when
  // someone would want a fresh answer.
  const refreshAll = useCallback(() => {
    refresh();
    refreshVersions();
    checkForUpdate();
  }, [refresh, refreshVersions, checkForUpdate]);

  const runStackAction = async (action) => {
    if (action === 'up') await api.stackUp();
    else if (action === 'down') await api.stackDown();
    else if (action === 'restart') await api.stackRestart();
    refresh();
  };

  const startAdd = ({ domain, php, wpVersion }) => {
    setShowAdd(false);
    setLog({
      title: `Add ${domain}`,
      request: { method: 'POST', path: '/api/sites', body: { domain, php, wpVersion } },
      onFinished: () => {
        refresh();
        refreshVersions();
      },
    });
  };

  const startUpdate = () => {
    setLog({
      title: 'wpdev update',
      request: { method: 'POST', path: '/api/stack/update' },
      onFinished: () => {
        refresh();
        refreshVersions();
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
        refreshVersions();
      },
    });
  };

  return (
    <div className="app">
      <Header
        health={health}
        onStackAction={runStackAction}
        onRefresh={refreshAll}
        onOpenDocs={() => setShowDocs(true)}
        updateInfo={updateInfo}
        onUpdate={startUpdate}
      />

      {showDocs ? (
        <DocsPage onClose={() => setShowDocs(false)} />
      ) : (
        <main className="main">
          <MachineStats stats={stats} error={statsError} />
          {sitesError && <p className="error">{sitesError}</p>}
          <SitesPanel sites={sites} versions={versions} onAdd={() => setShowAdd(true)} onManage={setManageSite} />
        </main>
      )}

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

      {log && (
        <LogModal
          title={log.title}
          request={log.request}
          onFinished={log.onFinished}
          onClose={() => setLog(null)}
        />
      )}
    </div>
  );
}
