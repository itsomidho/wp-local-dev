import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Layers, HardDrive, Trash2, Sparkles, RefreshCw, Pause, Play, Info } from 'lucide-react';
import { api } from '../api';
import { stripAnsi } from '../lib/parse';
import { formatBytes, jsonLines, parseSize, shortId, timeAgo } from '../lib/docker';
import { serviceInfo } from '../lib/services';
import ConfirmDialog, { TypeToConfirmDialog } from './ConfirmDialog';
import { Chip, EmptyState, Skeleton, useToast } from './ui';

const TABS = [
  { id: 'stats', label: 'Stats', icon: Activity },
  { id: 'images', label: 'Images', icon: Layers },
  { id: 'volumes', label: 'Volumes', icon: HardDrive },
];

// The bits of Portainer this stack actually needs -- live resource use,
// images and volumes -- read straight from Docker through wpdev, scoped
// to this project. Container details live on each Services card.
export default function DockerPage({ onShowDetails }) {
  const [tab, setTab] = useState('stats');
  return (
    <div className="page">
      <div className="toolbar">
        <div className="segmented-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <p className="muted small">This project&apos;s containers, images and volumes only.</p>
      </div>
      {tab === 'stats' && <StatsTab onShowDetails={onShowDetails} />}
      {tab === 'images' && <ImagesTab />}
      {tab === 'volumes' && <VolumesTab />}
    </div>
  );
}

function errorText(e) {
  return stripAnsi(e.data?.stdout || e.data?.stderr || e.message).trim().split('\n').pop();
}

// ---------------------------------------------------------------------------
// Stats -- `docker stats` sampled every few seconds while the tab is open.
// ---------------------------------------------------------------------------

function percent(text) {
  return Math.min(100, Math.max(0, parseFloat(text) || 0));
}

function Meter({ value, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
  return (
    <span className="meter">
      <span className={`meter-fill meter-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function StatsTab({ onShowDetails }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [at, setAt] = useState(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer;
    // One sample at a time: `docker stats` itself takes ~2s to measure,
    // so the next one starts 3s after the last answer, not on a fixed tick.
    const tick = async () => {
      if (!pausedRef.current) {
        try {
          const r = await api.dockerStats();
          if (!alive) return;
          setRows(jsonLines(r.stdout).sort((a, b) => a.Name.localeCompare(b.Name)));
          setAt(new Date());
          setError(null);
        } catch (e) {
          if (alive) setError(errorText(e));
        }
      }
      if (alive) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const togglePause = () => {
    pausedRef.current = !paused;
    setPaused(!paused);
  };

  const totals = rows && {
    cpu: rows.reduce((n, r) => n + (parseFloat(r.CPUPerc) || 0), 0),
    mem: rows.reduce((n, r) => n + (parseSize(r.MemUsage.split('/')[0]) || 0), 0),
  };

  return (
    <section className="card card-flush">
      <div className="card-head card-head-padded">
        <div>
          <h2>Live resource use</h2>
          <p>
            {totals ? `${totals.cpu.toFixed(1)}% CPU · ${formatBytes(totals.mem)} memory across ${rows.length} containers` : 'Sampling…'}
            {at && <span className="dim"> · {paused ? 'paused' : `updated ${at.toLocaleTimeString()}`}</span>}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={togglePause}>
          {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      {error && <p className="error card-pad">{error}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Container</th>
              <th title="Docker's convention: 100% is one full CPU core">CPU</th>
              <th>Memory</th>
              <th>Network in / out</th>
              <th>Disk read / write</th>
              <th className="num">PIDs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!rows &&
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <Skeleton height={18} />
                  </td>
                </tr>
              ))}
            {rows?.map((r) => {
              const service = r.Name.replace(/^wp-/, '');
              const info = serviceInfo(service);
              const Icon = info.icon;
              const [memUsed, memLimit] = r.MemUsage.split('/').map((x) => x.trim());
              return (
                <tr key={r.ID}>
                  <td>
                    <span className="cell-title">
                      <Icon size={15} /> {info.label}
                      <span className="mono dim">{r.Name}</span>
                    </span>
                  </td>
                  <td className="cell-meter">
                    <span className="mono">{r.CPUPerc}</span>
                    <Meter value={percent(r.CPUPerc)} />
                  </td>
                  <td className="cell-meter">
                    <span className="mono" title={`limit ${memLimit}`}>
                      {memUsed}
                    </span>
                    <Meter value={percent(r.MemPerc)} />
                  </td>
                  <td className="mono">{r.NetIO}</td>
                  <td className="mono">{r.BlockIO}</td>
                  <td className="mono num">{r.PIDs}</td>
                  <td className="cell-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowDetails(service)}>
                      <Info size={14} /> Details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function useList(load) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    setLoading(true);
    load()
      .then((r) => {
        setItems(jsonLines(r.stdout));
        setError(null);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(refresh, [refresh]);
  return { items, error, loading, refresh };
}

// Tagged images (what the stack runs) first, by name; untagged leftovers
// of old builds and pulls after them, newest first.
function sortImages(list) {
  return [...list].sort((a, b) => {
    const at = a.tags?.[0];
    const bt = b.tags?.[0];
    if (at && bt) return at.localeCompare(bt);
    if (at || bt) return at ? -1 : 1;
    return new Date(b.created) - new Date(a.created);
  });
}

function ImagesTab() {
  const toast = useToast();
  const { items: raw, error, loading, refresh } = useList(api.dockerImages);
  const items = raw && sortImages(raw);
  const [busy, setBusy] = useState(null); // image id, or 'prune'
  const [confirm, setConfirm] = useState(null); // {kind:'rm', image} | {kind:'prune'}

  const total = items?.reduce((n, i) => n + i.size, 0) || 0;
  const unusedUntagged = items?.filter((i) => !i.usedBy && (!i.tags || i.tags.length === 0)) || [];

  const run = async (action) => {
    setConfirm(null);
    const id = action.kind === 'prune' ? 'prune' : action.image.id;
    setBusy(id);
    try {
      const r = action.kind === 'prune' ? await api.pruneImages() : await api.removeImage(shortId(action.image.id));
      toast({ tone: 'success', title: action.kind === 'prune' ? 'Cleaned up images' : 'Image removed', description: stripAnsi(r.stdout).trim().split('\n').pop() });
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't remove", description: errorText(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <section className="card card-flush">
      <div className="card-head card-head-padded">
        <div>
          <h2>Images</h2>
          <p>{items ? `${items.length} images · ${formatBytes(total)}` : 'Loading…'}</p>
        </div>
        <div className="card-head-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirm({ kind: 'prune' })}
            disabled={busy !== null || unusedUntagged.length === 0}
            title={unusedUntagged.length === 0 ? 'No unused untagged images to clean up' : undefined}
          >
            <Sparkles size={14} /> Clean up{unusedUntagged.length ? ` (${unusedUntagged.length})` : ''}
          </button>
        </div>
      </div>
      {error && <p className="error card-pad">{error}</p>}
      {items && items.length === 0 ? (
        <EmptyState icon={Layers} title="No images yet" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>ID</th>
                <th className="num">Size</th>
                <th>Created</th>
                <th>Used by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!items &&
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={6}>
                      <Skeleton height={18} />
                    </td>
                  </tr>
                ))}
              {items?.map((img) => {
                const used = img.usedBy ? img.usedBy.split(',') : [];
                return (
                  <tr key={img.id}>
                    <td className="mono">{img.tags?.[0] || <span className="dim">&lt;untagged&gt;</span>}</td>
                    <td className="mono dim">{shortId(img.id)}</td>
                    <td className="mono num">{formatBytes(img.size)}</td>
                    <td title={new Date(img.created).toLocaleString()}>{timeAgo(img.created)}</td>
                    <td>
                      <div className="chips">
                        {used.length ? used.map((c) => <Chip key={c} mono>{c}</Chip>) : <Chip tone="warning">unused</Chip>}
                      </div>
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-ghost"
                        disabled={used.length > 0 || busy !== null}
                        title={used.length ? 'In use by a container' : 'Remove this image'}
                        onClick={() => setConfirm({ kind: 'rm', image: img })}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirm?.kind === 'prune' && (
        <ConfirmDialog
          title="Clean up unused images?"
          message={`Removes ${unusedUntagged.length} untagged image${unusedUntagged.length === 1 ? '' : 's'} of this project that no container uses: old builds and superseded pulls. Frees up to ${formatBytes(unusedUntagged.reduce((n, i) => n + i.size, 0))} (less where they share layers).`}
          confirmLabel="Clean up"
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
      {confirm?.kind === 'rm' && (
        <ConfirmDialog
          title="Remove this image?"
          message={`${confirm.image.tags?.[0] || shortId(confirm.image.id)} (${formatBytes(confirm.image.size)}). Nothing uses it; Docker pulls or builds it again if a service needs it later.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------

const VOLUME_ROLE = {
  wp_mysql_data: 'Every site’s database',
  wp_fastcgi_cache: 'Full-page cache',
  wp_portainer_data: 'Portainer’s settings',
  wp_api_mkcert_ca: 'HTTPS CA, only used when MKCERT_CAROOT isn’t set',
};

function VolumesTab() {
  const toast = useToast();
  const { items, error, loading, refresh } = useList(api.dockerVolumes);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);

  const total = items?.reduce((n, v) => n + (parseSize(v.size) || 0), 0) || 0;

  const remove = async (vol) => {
    setConfirm(null);
    setBusy(vol.name);
    try {
      await api.removeVolume(vol.name);
      toast({ tone: 'success', title: 'Volume removed', description: vol.name });
    } catch (e) {
      toast({ tone: 'error', title: "Couldn't remove", description: errorText(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <section className="card card-flush">
      <div className="card-head card-head-padded">
        <div>
          <h2>Volumes</h2>
          <p>{items ? `${items.length} volumes · ${formatBytes(total)}` : 'Loading…'}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      {error && <p className="error card-pad">{error}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Volume</th>
              <th className="num">Size</th>
              <th>Created</th>
              <th>Used by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!items &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <Skeleton height={18} />
                  </td>
                </tr>
              ))}
            {items?.map((vol) => {
              const used = vol.usedBy ? vol.usedBy.split(',') : [];
              return (
                <tr key={vol.name}>
                  <td>
                    <span className="cell-stack">
                      <span className="mono">{vol.volume || vol.name}</span>
                      <span className="dim small">{VOLUME_ROLE[vol.volume] || vol.name}</span>
                    </span>
                  </td>
                  <td className="mono num">{formatBytes(parseSize(vol.size))}</td>
                  <td title={new Date(vol.created).toLocaleString()}>{timeAgo(vol.created)}</td>
                  <td>
                    <div className="chips">
                      {used.length ? used.map((c) => <Chip key={c} mono>{c}</Chip>) : <Chip tone="warning">unused</Chip>}
                    </div>
                  </td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger-ghost"
                      disabled={used.length > 0 || busy !== null}
                      title={used.length ? 'In use by a container' : 'Delete this volume and its data'}
                      onClick={() => setConfirm(vol)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirm && (
        <TypeToConfirmDialog
          title="Delete this volume?"
          message={`Permanently deletes ${confirm.name} and everything stored in it (${formatBytes(parseSize(confirm.size))}). There is no undo.`}
          expected={confirm.volume || confirm.name}
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
    </section>
  );
}
