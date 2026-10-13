import { useEffect, useMemo, useState } from 'react';
import { Bug, Radio, RefreshCw, Download, Trash2, Search, ChevronDown } from 'lucide-react';
import { api, streamSSE } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { Skeleton, useToast } from './ui';
import { LEVELS, groupEntries, parseDebugLog } from '../lib/debuglog';
import { formatBytes, lastOutputLine } from '../lib/format';

// ---------------------------------------------------------------------------
// Debug: WordPress's debug constants, and its debug.log
// ---------------------------------------------------------------------------
const DEBUG_SETTINGS = [
  { key: 'WP_DEBUG_LOG', label: 'Log to file', hint: 'Errors go to wp-content/debug.log, shown below.' },
  {
    key: 'WP_DEBUG_DISPLAY',
    label: 'Show errors on pages',
    hint: 'Prints them into the page itself, where they can break layouts and JSON responses.',
  },
  { key: 'SCRIPT_DEBUG', label: 'Unminified core scripts', hint: "WordPress's own JS and CSS in their readable, unminified form." },
  { key: 'SAVEQUERIES', label: 'Record database queries', hint: 'Keeps every query for tools like Query Monitor. Slows pages down.' },
];

// How much of the log is read; more is the download.
const LOG_LINES = 2000;
// Rows rendered before "Show more", so a huge log can't stall the page.
const ROW_PAGE = 200;

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

// The debug switches for one site. onState gets wpdev's answer
// ({settings, log, logBytes}) each time it changes.
export function DebugSettings({ site, onState, reloadKey }) {
  const toast = useToast();
  const [state, setStateRaw] = useState(null); // {settings, log, logBytes}
  const setState = (v) => {
    setStateRaw(v);
    onState?.(v);
  };
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // the key being changed

  const loadSettings = () =>
    api
      .debug(site.name)
      .then((r) => {
        setState(r);
        setError(null);
      })
      .catch((e) => setError(lastOutputLine(e)));

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name, reloadKey]);

  const change = async (body, key) => {
    setBusy(key);
    try {
      setState(await api.setDebug(site.name, body));
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't change it", description: lastOutputLine(e), duration: 8000 });
      loadSettings();
    } finally {
      setBusy(null);
    }
  };

  const settings = state?.settings || {};
  const on = settings.WP_DEBUG === true;
  const logPath = typeof settings.WP_DEBUG_LOG === 'string' ? settings.WP_DEBUG_LOG : null;

  return (
      <section className="panel-section">
        <h4>Settings</h4>
        {error && <p className="error">{error}</p>}
        {!state && !error && <Skeleton height={160} />}
        {state && (
          <div className="switch-list">
            <div className="switch-row switch-row-main">
              <span className="switch-text">
                <strong>Debug mode</strong>
                <span>
                  <code>WP_DEBUG</code>: PHP notices, warnings and deprecations get reported, not just fatal errors.
                </span>
              </span>
              <Switch label="Debug mode" checked={on} disabled={busy !== null} onChange={(v) => change({ mode: v ? 'on' : 'off' }, 'WP_DEBUG')} />
            </div>
            {DEBUG_SETTINGS.map(({ key, label, hint }) => {
              const value = settings[key];
              const checked = value === true || typeof value === 'string';
              // The rest only matter with debug mode on (SAVEQUERIES aside).
              const inert = !on && key !== 'SAVEQUERIES' && key !== 'SCRIPT_DEBUG';
              return (
                <div className={`switch-row${inert ? ' is-inert' : ''}`} key={key}>
                  <span className="switch-text">
                    <strong>{label}</strong>
                    <span>
                      <code>{key}</code>: {key === 'WP_DEBUG_LOG' && logPath ? `logging to ${logPath}.` : hint}
                      {inert && ' Has no effect while debug mode is off.'}
                    </span>
                  </span>
                  <Switch label={label} checked={checked} disabled={busy !== null} onChange={(v) => change({ key, value: v }, key)} />
                </div>
              );
            })}
          </div>
        )}
      </section>
  );
}

export function DebugLog({ site, logPath, logBytes, onChanged }) {
  const toast = useToast();
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [level, setLevel] = useState('all');
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [shown, setShown] = useState(ROW_PAGE);
  const [open, setOpen] = useState(() => new Set()); // expanded row keys
  const [confirmClear, setConfirmClear] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.debugLog(site.name, LOG_LINES);
      setText(r.text);
      setError(null);
    } catch (e) {
      setError(lastOutputLine(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  // Live: new lines as PHP writes them, appended to what's loaded (the
  // newest LOG_LINES * 2 kept).
  useEffect(() => {
    if (!live) return undefined;
    const abort = streamSSE('GET', `/api/sites/${site.name}/debug/log/stream`, undefined, {
      onLine: ({ stream, line }) => {
        if (stream !== 'stdout') return;
        setText((t) => {
          const lines = `${t || ''}${line}\n`.split('\n');
          return lines.length > LOG_LINES * 2 ? lines.slice(-LOG_LINES * 2).join('\n') : lines.join('\n');
        });
      },
      onError: () => setLive(false),
    });
    return abort;
  }, [live, site.name]);

  const entries = useMemo(() => (text ? parseDebugLog(text) : []), [text]);
  const counts = useMemo(() => {
    const c = {};
    for (const e of entries) c[e.level] = (c[e.level] || 0) + 1;
    return c;
  }, [entries]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = entries.filter(
      (e) => (level === 'all' || e.level === level) && (!q || e.message.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)),
    );
    return grouped
      ? groupEntries(list)
      : list
          .map((e) => ({ ...e, count: 1, variants: 1 }))
          .reverse();
  }, [entries, level, query, grouped]);

  const clear = async () => {
    setConfirmClear(false);
    try {
      await api.clearDebugLog(site.name);
      setText('');
      onChanged?.();
      toast({ tone: 'success', title: 'Debug log cleared' });
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't clear it", description: lastOutputLine(e) });
    }
  };

  const download = () =>
    api.downloadDebugLog(site.name).catch((e) => toast({ tone: 'error', title: 'Download failed', description: e.message }));

  const toggle = (key) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="panel-section">
      <div className="section-row">
        <h4>Debug log</h4>
        <div className="log-actions">
          <button
            type="button"
            className={`btn btn-sm ${live ? 'btn-soft is-live' : 'btn-ghost'}`}
            onClick={() => setLive((v) => !v)}
            title="Show new entries as they're written"
            aria-pressed={live}
          >
            <Radio size={14} /> {live ? 'Live' : 'Go live'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={load} disabled={loading} title="Reload" aria-label="Reload the log">
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={download} title="Download the whole log" aria-label="Download the log">
            <Download size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setConfirmClear(true)} title="Clear the log" aria-label="Clear the log">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {logPath && (
        <p className="field-hint">
          <code>{logPath}</code> · {formatBytes(logBytes || 0)}
          {logBytes > 0 && ` · showing the newest ${LOG_LINES.toLocaleString()} lines`} · moved to <code>.1</code> past 50 MB
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="log-toolbar">
        <div className="log-levels" role="radiogroup" aria-label="Level">
          {[{ id: 'all', label: 'All' }, ...LEVELS].map((l) => {
            const n = l.id === 'all' ? entries.length : counts[l.id] || 0;
            if (l.id !== 'all' && !n) return null;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={level === l.id}
                className={`log-level${level === l.id ? ' is-active' : ''}${l.tone ? ` tone-${l.tone}` : ''}`}
                onClick={() => {
                  setLevel(l.id);
                  setShown(ROW_PAGE);
                }}
              >
                {l.label} <span className="log-level-count">{n.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
        <div className="log-toolbar-end">
          <label className="input-search log-search">
            <Search size={14} />
            <input type="search" placeholder="Search" aria-label="Search the log" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="check log-group">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            <span>Group similar</span>
          </label>
        </div>
      </div>

      {text === null && !error && <Skeleton height={200} />}
      {text !== null && rows.length === 0 && (
        <div className="empty empty-sm">
          <span className="empty-icon">
            <Bug size={20} />
          </span>
          <p>{entries.length ? 'Nothing matches.' : live ? 'Empty so far; new entries appear here as they are written.' : 'The log is empty.'}</p>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="log-list">
          {rows.slice(0, shown).map((r, i) => {
            const key = `${r.level}:${r.message}:${i}`;
            const meta = LEVELS.find((l) => l.id === r.level);
            const expanded = open.has(key);
            return (
              <li key={key} className={`log-entry level-${r.level}${expanded ? ' is-open' : ''}`}>
                <button type="button" className="log-entry-head" onClick={() => toggle(key)} aria-expanded={expanded}>
                  <span className={`log-chip${meta.tone ? ` tone-${meta.tone}` : ''}`}>{meta.label}</span>
                  <span className="log-message mono">{r.message.replace(/^PHP [A-Za-z ]+?:\s+/, '')}</span>
                  <span className="log-meta">
                    {r.count > 1 && (
                      <span className="log-count" title={r.variants > 1 ? `${r.variants.toLocaleString()} different messages like this` : undefined}>
                        ×{r.count.toLocaleString()}
                      </span>
                    )}
                    {r.time && (
                      <time title={new Date(r.time).toLocaleString()}>{new Date(r.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                    )}
                    <ChevronDown size={14} className="log-chevron" />
                  </span>
                </button>
                {expanded && (
                  <div className="log-entry-body">
                    <pre className="mono">{r.message}</pre>
                    {r.detail && <pre className="mono log-detail">{r.detail}</pre>}
                    <p className="field-hint">
                      {r.time && new Date(r.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}
                      {r.count > 1 &&
                        ` · ${r.count.toLocaleString()} times${r.first && r.first !== r.time ? `, first ${new Date(r.first).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`}
                      {r.variants > 1 && ` · ${r.variants.toLocaleString()} variants, newest shown`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > shown && (
        <button type="button" className="btn btn-ghost btn-sm log-more" onClick={() => setShown((n) => n + ROW_PAGE)}>
          Show {Math.min(ROW_PAGE, rows.length - shown)} more of {(rows.length - shown).toLocaleString()}
        </button>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear the debug log?"
          message={`Empties ${logPath || 'debug.log'} (and removes its rotated .1). Download it first to keep it.`}
          confirmLabel="Clear"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={clear}
        />
      )}
    </section>
  );
}
