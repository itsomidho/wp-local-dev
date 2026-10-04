import { useState } from 'react';
import { api, getToken, setToken } from '../api';
import Terminal, { stripAnsiToLines } from './Terminal';
import ConfirmDialog from './ConfirmDialog';

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

export default function Header({ health, onStackAction, onRefresh }) {
  const [view, setView] = useState(null); // 'doctor' | 'status' | 'settings' | null
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokenInput, setTokenInput] = useState(getToken());
  const [confirmStackAction, setConfirmStackAction] = useState(null); // 'restart' | 'down' | null

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
        <span className={`health-dot ${health}`} />
        <span className="health-label">{healthLabel}</span>
      </div>

      <div className="header-actions">
        <div className="header-group">
          <button disabled={busy} onClick={() => requestStackAction('up')}>Up</button>
          <button disabled={busy} className="secondary" onClick={() => requestStackAction('restart')}>Restart</button>
          <button disabled={busy} className="secondary" onClick={() => requestStackAction('down')}>Down</button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <button className="ghost" onClick={openStatus}>Status</button>
          <button className="ghost" onClick={openDoctor}>Doctor</button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <span className="header-group-label">Open</span>
          <button className="ghost" onClick={() => openLink('adminer')}>Adminer</button>
          <button className="ghost" onClick={() => openLink('portainer')}>Portainer</button>
          <button className="ghost" onClick={() => openLink('mailpit')}>Mailpit</button>
        </div>

        <div className="header-divider" />

        <div className="header-group">
          <button className="icon-button" onClick={onRefresh} title="Refresh" aria-label="Refresh">
            <RefreshIcon />
          </button>
          <button className="icon-button" onClick={() => setView('settings')} title="Settings" aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {(view === 'doctor' || view === 'status') && (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header-cmd">
              <h3>$ wpdev {view}</h3>
            </div>
            <Terminal lines={stripAnsiToLines(output)} className="terminal-modal" />
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

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M12.5 7.5a5 5 0 1 1-1.47-3.54M12.5 2v3.5H9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.5 1.5v1.4M7.5 12.1v1.4M13.5 7.5h-1.4M2.9 7.5H1.5M11.6 3.4l-1 1M4.4 10.6l-1 1M11.6 11.6l-1-1M4.4 4.4l-1-1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
