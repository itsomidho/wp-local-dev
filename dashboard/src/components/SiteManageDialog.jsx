import { useEffect, useState } from 'react';
import { api } from '../api';

const TABS = ['Overview', 'Cache', 'Snapshots', 'Clone', 'WP-CLI', 'Remove'];

export default function SiteManageDialog({ site, onClose, onRunAction, onRemoved }) {
  const [tab, setTab] = useState('Overview');

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <div className="modal-header">
          <h3>{site.domain}</h3>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={t === tab ? 'tab tab-active' : 'tab'}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'Overview' && <OverviewTab site={site} />}
          {tab === 'Cache' && <CacheTab site={site} />}
          {tab === 'Snapshots' && <SnapshotsTab site={site} onRunAction={onRunAction} />}
          {tab === 'Clone' && <CloneTab site={site} onRunAction={onRunAction} />}
          {tab === 'WP-CLI' && <WpCliTab site={site} />}
          {tab === 'Remove' && (
            <RemoveTab site={site} onRunAction={onRunAction} onRemoved={onRemoved} />
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ site }) {
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .creds(site.name)
      .then((r) => setCreds(r.stdout))
      .catch((e) => setError(e.message));
  }, [site.name]);

  return (
    <div>
      <p>
        <a href={`https://${site.domain}`} target="_blank" rel="noreferrer">
          https://{site.domain}
        </a>{' '}
        /{' '}
        <a href={`https://${site.domain}/wp-admin`} target="_blank" rel="noreferrer">
          wp-admin
        </a>
      </p>
      {error && <p className="error">{error}</p>}
      {creds && <pre className="terminal">{creds}</pre>}
    </div>
  );
}

function CacheTab({ site }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const toggle = async (mode) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.cache(site.name, mode);
      setResult(r.stdout || r.stderr);
    } catch (e) {
      setResult(e.message);
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
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
    <div>
      <p className="muted">
        Full-page nginx cache for this site. Purge clears the cache shared by
        every site that has it enabled.
      </p>
      <div className="button-row">
        <button disabled={busy} onClick={() => toggle('on')}>
          Turn on
        </button>
        <button disabled={busy} className="secondary" onClick={() => toggle('off')}>
          Turn off
        </button>
        <button disabled={busy} className="secondary" onClick={purge}>
          Purge cache
        </button>
      </div>
      {result && <pre className="terminal">{result}</pre>}
    </div>
  );
}

function SnapshotsTab({ site, onRunAction }) {
  const [list, setList] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);

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
    if (!window.confirm(`Restore ${site.domain} from ${snapId || 'the latest snapshot'}? Current files and database will be overwritten.`)) {
      return;
    }
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
    <div>
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <input
          name="snapshotLabel"
          placeholder="label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button onClick={createSnapshot}>Create snapshot</button>
      </div>
      {snapIds.length === 0 ? (
        <p className="muted">No snapshots yet.</p>
      ) : (
        <ul className="snapshot-list">
          {snapIds.map((id) => (
            <li key={id}>
              <code>{id}</code>
              <button className="secondary small" onClick={() => restore(id)}>
                Restore this
              </button>
            </li>
          ))}
        </ul>
      )}
      {snapIds.length > 0 && (
        <button className="secondary" onClick={() => restore(null)}>
          Restore latest
        </button>
      )}
    </div>
  );
}

function CloneTab({ site, onRunAction }) {
  const [newName, setNewName] = useState('');

  const clone = () => {
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
    <div>
      <p className="muted">Duplicates files + database under a new domain.</p>
      <div className="button-row">
        <input
          name="cloneName"
          placeholder="new-site-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button disabled={!newName.trim()} onClick={clone}>
          Clone
        </button>
      </div>
    </div>
  );
}

function WpCliTab({ site }) {
  const [cmd, setCmd] = useState('plugin list');
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState(null);

  const run = async () => {
    const args = cmd.trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) return;
    setBusy(true);
    setOutput(null);
    try {
      const r = await api.wpCli(site.name, args);
      setOutput(r.stdout || r.stderr || '(no output)');
    } catch (e) {
      setOutput(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="muted">Runs against this site: <code>wp {cmd}</code></p>
      <div className="button-row">
        <input name="wpCliArgs" value={cmd} onChange={(e) => setCmd(e.target.value)} />
        <button disabled={busy} onClick={run}>
          Run
        </button>
      </div>
      {output && <pre className="terminal">{output}</pre>}
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
    <div>
      <p className="error">
        Permanently deletes this site's files, database, Nginx config, and SSL
        certificate. There is no undo (snapshots are not touched).
      </p>
      <p className="muted">Type the domain to confirm: <code>{site.domain}</code></p>
      <div className="button-row">
        <input name="confirmDomain" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <button
          className="danger"
          disabled={confirmText !== site.domain}
          onClick={remove}
        >
          Delete permanently
        </button>
      </div>
    </div>
  );
}
