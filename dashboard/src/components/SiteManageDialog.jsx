import { useEffect, useState } from 'react';
import { api, siteUrl } from '../api';
import ConfirmDialog from './ConfirmDialog';

const TABS = ['Overview', 'Cache', 'Media', 'Snapshots', 'Clone', 'WP-CLI', 'Remove'];

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
          {tab === 'Media' && <MediaTab site={site} />}
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
  const [certBusy, setCertBusy] = useState(false);
  const [certResult, setCertResult] = useState(null);
  const [confirmCert, setConfirmCert] = useState(false);

  const fixPerms = async () => {
    setCertBusy(true);
    setCertResult(null);
    try {
      const r = await api.fixPerms(site.name);
      setCertResult(r.stdout || r.stderr);
    } catch (e) {
      setCertResult(e.message);
    } finally {
      setCertBusy(false);
    }
  };

  const reissueCert = async () => {
    setConfirmCert(false);
    setCertBusy(true);
    setCertResult(null);
    try {
      const r = await api.cert(site.name);
      setCertResult(r.stdout || r.stderr);
    } catch (e) {
      setCertResult(e.message);
    } finally {
      setCertBusy(false);
    }
  };

  useEffect(() => {
    api
      .creds(site.name)
      .then((r) => setCreds(r.stdout))
      .catch((e) => setError(e.message));
  }, [site.name]);

  return (
    <div>
      <p>
        <a href={siteUrl(site.domain)} target="_blank" rel="noreferrer">
          {siteUrl(site.domain)}
        </a>{' '}
        /{' '}
        <a href={`${siteUrl(site.domain)}/wp-admin`} target="_blank" rel="noreferrer">
          wp-admin
        </a>
      </p>
      {error && <p className="error">{error}</p>}
      {creds && <pre className="terminal">{creds}</pre>}
      <div className="button-row">
        <button disabled={certBusy} className="secondary" onClick={() => setConfirmCert(true)}>
          Reissue HTTPS certificate
        </button>
        <button
          disabled={certBusy}
          className="secondary"
          title="Make every file in this site yours and writable again, e.g. after copying a site in from elsewhere"
          onClick={fixPerms}
        >
          Fix file permissions
        </button>
      </div>
      {certResult && <pre className="terminal">{certResult}</pre>}
      {confirmCert && (
        <ConfirmDialog
          title="Reissue this site's certificate?"
          message={`Replaces ${site.domain}'s certificate with a new one from the current mkcert CA and reloads nginx. Use it when Doctor flags the cert, or the browser shows a certificate warning.`}
          onCancel={() => setConfirmCert(false)}
          onConfirm={reissueCert}
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
      setResult(e.message);
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
        <button disabled={busy} className="secondary" onClick={() => setConfirmPurge(true)}>
          Purge cache
        </button>
      </div>
      {result && <pre className="terminal">{result}</pre>}
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
      setResult(e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <div>
      <p className="muted">
        For a local copy without production's uploads folder. When on, any file under{' '}
        <code>/wp-content/uploads/</code> that's missing locally is streamed from the same path on
        production, through this site, so images load without a plugin, and no matter how this
        machine resolves production (e.g. an /etc/hosts entry for production wp-admin). Local
        files still win. Nothing is downloaded or stored.
      </p>
      {error && <p className="error">{error}</p>}
      {status && (
        <p>
          <span className={status.on ? 'badge badge-ok' : 'badge badge-muted'}>
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
        <button disabled={busy || !url.trim()} onClick={() => run({ url: url.trim() })}>
          {status && status.on ? 'Update' : 'Turn on'}
        </button>
        {status && status.on && (
          <button disabled={busy} className="secondary" onClick={() => setConfirmOff(true)}>
            Turn off
          </button>
        )}
      </div>
      {result && <pre className="terminal">{result}</pre>}
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
              <button className="secondary small" onClick={() => setConfirmRestore({ snapId: id })}>
                Restore this
              </button>
            </li>
          ))}
        </ul>
      )}
      {snapIds.length > 0 && (
        <button className="secondary" onClick={() => setConfirmRestore({ snapId: null })}>
          Restore latest
        </button>
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
    <div>
      <p className="muted">Duplicates files + database under a new domain.</p>
      <div className="button-row">
        <input
          name="cloneName"
          placeholder="new-site-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button disabled={!newName.trim()} onClick={() => setConfirmClone(true)}>
          Clone
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
        <button disabled={busy || !cmd.trim()} onClick={() => setConfirmRun(true)}>
          Run
        </button>
      </div>
      {output && <pre className="terminal">{output}</pre>}
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
