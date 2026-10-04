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

  return (
    <header className="header">
      <div className="header-title">
        <span className={`health-dot ${health}`} title={`API: ${health}`} />
        <h1>wp-local-dev</h1>
      </div>

      <div className="header-actions">
        <button disabled={busy} onClick={() => requestStackAction('up')}>Up</button>
        <button disabled={busy} className="secondary" onClick={() => requestStackAction('restart')}>Restart</button>
        <button disabled={busy} className="secondary" onClick={() => requestStackAction('down')}>Down</button>
        <button className="secondary" onClick={openStatus}>Status</button>
        <button className="secondary" onClick={openDoctor}>Doctor</button>
        <button className="secondary" onClick={() => openLink('adminer')}>Adminer</button>
        <button className="secondary" onClick={() => openLink('portainer')}>Portainer</button>
        <button className="secondary" onClick={() => openLink('mailpit')}>Mailpit</button>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
        <button className="secondary" onClick={() => setView('settings')}>⚙</button>
      </div>

      {(view === 'doctor' || view === 'status') && (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{view === 'doctor' ? 'Doctor' : 'Status'}</h3>
            </div>
            <Terminal lines={stripAnsiToLines(output)} className="terminal-modal" />
            <div className="modal-footer">
              <button onClick={() => setView(null)}>Close</button>
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
