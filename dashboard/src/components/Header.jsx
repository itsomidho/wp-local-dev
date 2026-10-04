import { useState } from 'react';
import {
  Play,
  RotateCw,
  Square,
  Activity,
  Stethoscope,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Moon,
} from 'lucide-react';
import { api, appVersion, getToken, setToken } from '../api';
import Terminal, { stripAnsiToLines } from './Terminal';
import StatusTable, { parseStatusSites } from './StatusTable';
import ConfirmDialog from './ConfirmDialog';
import { currentEffectiveTheme, setTheme } from '../theme';

const STACK_CONFIRM = {
  restart: {
    title: 'Restart the stack?',
    message: 'Every container restarts. All sites will be briefly unreachable.',
  },
  down: {
    title: 'Stop the stack?',
    message: 'Every container stops. Sites stay unreachable until you run Up again (no data is deleted).',
    danger: true,
  },
};

export default function Header({ health, onStackAction, onRefresh, onOpenDocs }) {
  const [view, setView] = useState(null); // 'doctor' | 'status' | 'settings' | null
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokenInput, setTokenInput] = useState(getToken());
  const [confirmStackAction, setConfirmStackAction] = useState(null); // 'restart' | 'down' | null
  const [theme, setThemeState] = useState(currentEffectiveTheme());

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const openDoctor = async () => {
    setView('doctor');
    setOutput('Loading…');
    try {
      const r = await api.doctor();
      setOutput(r.stdout);
    } catch (e) {
      setOutput(e.message);
    }
  };

  const openStatus = async () => {
    setView('status');
    setOutput('Loading…');
    try {
      const r = await api.status();
      setOutput(r.stdout);
    } catch (e) {
      setOutput(e.message);
    }
  };

  const openLink = async (which) => {
    try {
      const r = await api.links[which]();
      const match = /Opening (\S+)/.exec(r.stdout || '');
      if (match) window.open(match[1], '_blank');
      else alert(r.stdout);
    } catch (e) {
      alert(e.message);
    }
  };

  const runStackAction = async (action) => {
    setBusy(true);
    try {
      await onStackAction(action);
    } finally {
      setBusy(false);
    }
  };

  const requestStackAction = (action) => {
    if (action === 'up') {
      runStackAction('up');
      return;
    }
    setConfirmStackAction(action);
  };

  const healthLabel = health === 'ok' ? 'connected' : health === 'down' ? 'unreachable' : 'checking…';

  return (
    <header className="header">
      <div className="header-title">
        <span className="mark">wp</span>
        <h1>local-dev</h1>
        {appVersion() && (
          <span className="badge" title="git describe for this checkout">
            {appVersion()}
          </span>
        )}
        <span className={`health-dot ${health}`} />
        <span className="health-label">{healthLabel}</span>
      </div>

      <div className="header-actions">
        <div className="header-group">
          <button disabled={busy} onClick={() => requestStackAction('up')}>
            <Play size={14} strokeWidth={2} /> Up
          </button>
          <button disabled={busy} className="secondary" onClick={() => requestStackAction('restart')}>
            <RotateCw size={14} strokeWidth={2} /> Restart
          </button>
          <button disabled={busy} className="secondary" onClick={() => requestStackAction('down')}>
            <Square size={14} strokeWidth={2} /> Down
          </button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <button className="ghost" onClick={openStatus}>
            <Activity size={14} strokeWidth={2} /> Status
          </button>
          <button className="ghost" onClick={openDoctor}>
            <Stethoscope size={14} strokeWidth={2} /> Doctor
          </button>
          <button className="ghost" onClick={onOpenDocs}>
            <BookOpen size={14} strokeWidth={2} /> Docs
          </button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <span className="header-group-label">Open</span>
          <button className="ghost" onClick={() => openLink('adminer')}>
            Adminer <ExternalLink size={12} strokeWidth={2} />
          </button>
          <button className="ghost" onClick={() => openLink('portainer')}>
            Portainer <ExternalLink size={12} strokeWidth={2} />
          </button>
          <button className="ghost" onClick={() => openLink('mailpit')}>
            Mailpit <ExternalLink size={12} strokeWidth={2} />
          </button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <button className="icon-button" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
          <button className="icon-button" onClick={onRefresh} title="Refresh" aria-label="Refresh">
            <RefreshCw size={16} strokeWidth={2} />
          </button>
          <button className="icon-button" onClick={() => setView('settings')} title="Settings" aria-label="Settings">
            <SettingsIcon size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {view === 'doctor' && (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header-cmd">
              <h3>$ wpdev doctor</h3>
            </div>
            <Terminal lines={stripAnsiToLines(output)} className="terminal-modal" />
            <div className="modal-footer">
              <button className="secondary" onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {view === 'status' && (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Status</h3>
            </div>
            <StatusTable rows={parseStatusSites(output)} rawOutput={output} />
            <div className="modal-footer">
              <button className="secondary" onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>API base</span>
                <input name="apiBase" readOnly value={api.base()} />
              </label>
              <label className="field">
                <span>API token</span>
                <input
                  name="apiToken"
                  type="password"
                  placeholder="only if API_TOKEN is set in .env"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  setToken(tokenInput);
                  setView(null);
                  onRefresh();
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmStackAction && (
        <ConfirmDialog
          title={STACK_CONFIRM[confirmStackAction].title}
          message={STACK_CONFIRM[confirmStackAction].message}
          confirmLabel={confirmStackAction === 'down' ? 'Stop' : 'Restart'}
          danger={STACK_CONFIRM[confirmStackAction].danger}
          onCancel={() => setConfirmStackAction(null)}
          onConfirm={() => {
            const action = confirmStackAction;
            setConfirmStackAction(null);
            runStackAction(action);
          }}
        />
      )}
    </header>
  );
}
