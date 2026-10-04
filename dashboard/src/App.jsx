import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import Header from './components/Header';
import MachineStats from './components/MachineStats';
import SitesPanel, { parseSites } from './components/SitesPanel';
import AddSiteDialog from './components/AddSiteDialog';
import SiteManageDialog from './components/SiteManageDialog';
import LogModal from './components/LogModal';

export default function App() {
  const [health, setHealth] = useState('checking');
  const [sites, setSites] = useState([]);
  const [sitesError, setSitesError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manageSite, setManageSite] = useState(null);
  const [log, setLog] = useState(null); // {title, request, onFinished}

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

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const runStackAction = async (action) => {
    if (action === 'up') await api.stackUp();
    else if (action === 'down') await api.stackDown();
    else if (action === 'restart') await api.stackRestart();
    refresh();
  };

  const startAdd = ({ domain, php }) => {
    setShowAdd(false);
    setLog({
      title: `Add ${domain}`,
      request: { method: 'POST', path: '/api/sites', body: { domain, php } },
      onFinished: refresh,
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
      },
    });
  };

  return (
    <div className="app">
      <Header health={health} onStackAction={runStackAction} onRefresh={refresh} />

      <main className="main">
        <MachineStats stats={stats} error={statsError} />
        {sitesError && <p className="error">{sitesError}</p>}
        <SitesPanel sites={sites} onAdd={() => setShowAdd(true)} onManage={setManageSite} />
      </main>

      {showAdd && <AddSiteDialog onSubmit={startAdd} onClose={() => setShowAdd(false)} />}

      {manageSite && (
        <SiteManageDialog
          site={manageSite}
          onClose={() => setManageSite(null)}
          onRunAction={runAction}
          onRemoved={() => {
            setManageSite(null);
            refresh();
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
