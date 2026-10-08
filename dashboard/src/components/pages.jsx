import { useMemo, useState } from 'react';
import {
  Globe,
  Boxes,
  Activity,
  Plus,
  Search,
  LayoutGrid,
  List,
  ArrowRight,
  Stethoscope,
  Mail,
  Database,
  ScrollText,
  ArrowUpRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Terminal as TerminalIcon,
  Settings2,
  RotateCw,
  Loader2,
} from 'lucide-react';
import { siteUrl } from '../api';
import MachineStats from './MachineStats';
import SiteCard, { SiteChips, httpTone } from './SiteCard';
import Terminal, { stripAnsiToLines } from './Terminal';
import { Avatar, Chip, EmptyState, Skeleton, StatusDot, useFollowPage } from './ui';
import { idlePhpVersions, mergeServices, serviceInfo } from '../lib/services';

// How many sites the Overview lists before "+N more" (two columns of 4).
const OVERVIEW_SITES = 8;

function phpInUse(sites) {
  return [...new Set(sites.map((s) => s.php).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Kpi({ icon: Icon, label, value, hint, tone = 'brand', loading }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-icon">
        <Icon size={18} />
      </span>
      <div className="kpi-text">
        <span className="kpi-label">{label}</span>
        {loading ? <Skeleton width={60} height={26} /> : <span className="kpi-value">{value}</span>}
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

export function OverviewPage({ sites, sitesLoading, statusBySite, services, status, stats, statsError, onManage, onAdd, onNavigate, onOpenTool }) {
  const merged = mergeServices(services, phpInUse(sites));
  const running = merged.filter((s) => s.state === 'running').length;
  const reachable = sites.filter((s) => /^[23]/.test(statusBySite[s.domain]?.http || '')).length;
  const statusRows = Object.values(statusBySite);
  const mysql = statusRows.find((r) => r.mysql && r.mysql !== 'n/a')?.mysql;
  const loadingStatus = !status.checkedAt;

  return (
    <div className="page">
      <section className="kpis">
        <Kpi icon={Globe} label="Sites" value={sites.length} hint={sites.length === 1 ? 'site provisioned' : 'sites provisioned'} loading={sitesLoading} />
        <Kpi
          icon={Activity}
          tone={!loadingStatus && reachable < sites.length ? 'warning' : 'success'}
          label="Reachable"
          value={`${reachable}/${sites.length}`}
          hint="answering over HTTPS"
          loading={loadingStatus}
        />
        <Kpi
          icon={Boxes}
          tone={!loadingStatus && running < merged.length ? 'warning' : 'info'}
          label="Services"
          value={`${running}/${merged.length}`}
          hint="containers running"
          loading={loadingStatus}
        />
        <Kpi icon={Database} tone="violet" label="MySQL" value={mysql || '—'} hint="shared by every site" loading={loadingStatus} />
      </section>

      <section className="quick-actions">
        <button type="button" className="quick-action" onClick={onAdd}>
          <span className="quick-action-icon">
            <Plus size={18} />
          </span>
          <span className="quick-action-text">
            <strong>New site</strong>
            <small>Files, database, HTTPS</small>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => onNavigate('doctor')}>
          <span className="quick-action-icon">
            <Stethoscope size={18} />
          </span>
          <span className="quick-action-text">
            <strong>Run doctor</strong>
            <small>Find anything misconfigured</small>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => onOpenTool('mailpit')}>
          <span className="quick-action-icon">
            <Mail size={18} />
          </span>
          <span className="quick-action-text">
            <strong>Mailbox</strong>
            <small>Every email the sites sent</small>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => onOpenTool('adminer')}>
          <span className="quick-action-icon">
            <Database size={18} />
          </span>
          <span className="quick-action-text">
            <strong>Adminer</strong>
            <small>Browse the databases</small>
          </span>
        </button>
      </section>

      {/* The two fixed-size cards side by side; Sites, the one that grows
          with every site, gets its own full-width row below them. */}
      <div className="overview-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Machine</h2>
              <p>The host running Docker</p>
            </div>
          </div>
          <MachineStats stats={stats} error={statsError} layout="row" />
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Services</h2>
              <p>{loadingStatus ? 'Checking containers…' : `${running} of ${merged.length} containers running`}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('services')}>
              Details <ArrowRight size={14} />
            </button>
          </div>
          <div className="service-strip service-strip-compact">
            {groupPhp(merged).map((svc) => {
              const info = svc.php ? { label: 'PHP', icon: serviceInfo(svc.php[0].service).icon } : serviceInfo(svc.service);
              const Icon = info.icon;
              return (
                <div key={svc.service} className={`service-mini state-${loadingStatus ? 'unknown' : svc.state}`} title={svc.status}>
                  <Icon size={15} />
                  <span>
                    {info.label}
                    {svc.php && (
                      <span className="service-mini-versions mono">
                        {svc.php.length > 3 ? `${svc.php.length} versions` : svc.php.map((p) => serviceInfo(p.service).php).join(' · ')}
                      </span>
                    )}
                  </span>
                  <StatusDot tone={loadingStatus ? 'muted' : stateTone(svc.state)} />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Sites</h2>
            <p>Every site this stack serves</p>
          </div>
          <div className="card-head-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('sites')}>
              View all <ArrowRight size={14} />
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
              <Plus size={15} /> Add site
            </button>
          </div>
        </div>
        {sitesLoading ? (
          <RowSkeletons />
        ) : sites.length === 0 ? (
          <EmptyState icon={Globe} title="No sites yet" action={<button className="btn btn-primary" onClick={onAdd}><Plus size={15} /> Add your first site</button>}>
            Provision a WordPress site with its own database, HTTPS certificate and PHP version.
          </EmptyState>
        ) : (
          <>
            <ul className="site-rows site-rows-2col">
              {sites.slice(0, OVERVIEW_SITES).map((site) => (
                <SiteRow key={site.name} site={site} status={statusBySite[site.domain]} onManage={onManage} />
              ))}
            </ul>
            {sites.length > OVERVIEW_SITES && (
              <button type="button" className="btn btn-ghost btn-sm more-sites" onClick={() => onNavigate('sites')}>
                +{sites.length - OVERVIEW_SITES} more <ArrowRight size={14} />
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// The Overview's Services card shows every PHP version as one "PHP" tile
// (its versions listed in it), so the card keeps the same height however
// many versions run -- it shares a row with the fixed-height Machine card.
// The tile is only as healthy as its least healthy version. The Services
// page still has a card per version.
const STATE_RANK = { running: 0, restarting: 1, unhealthy: 1, stopped: 2 };

function groupPhp(services) {
  const php = services.filter((s) => serviceInfo(s.service).php);
  if (php.length === 0) return services;
  const worst = php.reduce((a, b) => ((STATE_RANK[b.state] ?? 2) > (STATE_RANK[a.state] ?? 2) ? b : a));
  const tile = {
    service: 'php',
    php,
    state: worst.state,
    status: php.map((p) => `${serviceInfo(p.service).label}: ${p.status}`).join('\n'),
  };
  const at = services.indexOf(php[0]);
  const rest = services.filter((s) => !serviceInfo(s.service).php);
  return [...rest.slice(0, at), tile, ...rest.slice(at)];
}

function RowSkeletons() {
  return (
    <ul className="site-rows">
      {[0, 1, 2].map((i) => (
        <li className="site-row" key={i}>
          <Skeleton width={36} height={36} radius={10} />
          <div className="site-row-main">
            <Skeleton width="45%" />
            <Skeleton width="30%" height={20} radius={999} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SiteRow({ site, status, onManage }) {
  const reach = httpTone(status?.http);
  return (
    <li className="site-row">
      <Avatar name={site.name} size={36} />
      <div className="site-row-main">
        <a className="site-domain" href={siteUrl(site.domain)} target="_blank" rel="noreferrer">
          {site.domain}
        </a>
        <SiteChips site={site} status={status} />
      </div>
      <StatusDot tone={reach.tone} label={reach.label} />
      <button type="button" className="btn btn-soft btn-sm" onClick={() => onManage(site)} aria-label={`Manage ${site.domain}`}>
        <Settings2 size={14} /> <span className="hide-sm">Manage</span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

const VIEW_KEY = 'wpdev_sites_view';

function storedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function SitesPage({ sites, sitesLoading, statusBySite, onManage, onAdd }) {
  const [query, setQuery] = useState('');
  const [php, setPhp] = useState('all');
  const [view, setView] = useState(storedView);

  const changeView = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const phpVersions = useMemo(() => [...new Set(sites.map((s) => s.php).filter(Boolean))].sort(), [sites]);

  const filtered = sites.filter(
    (s) => (php === 'all' || s.php === php) && (!query.trim() || s.domain.includes(query.trim().toLowerCase())),
  );

  return (
    <div className="page">
      <div className="toolbar">
        <label className="input-search">
          <Search size={15} />
          <input name="siteSearch" placeholder="Filter sites…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {phpVersions.length > 1 && (
          <div className="filter-pills" role="group" aria-label="PHP version">
            {['all', ...phpVersions].map((v) => (
              <button key={v} type="button" className={`filter-pill${php === v ? ' is-active' : ''}`} onClick={() => setPhp(v)}>
                {v === 'all' ? 'All' : `PHP ${v}`}
              </button>
            ))}
          </div>
        )}
        <div className="toolbar-spacer" />
        <div className="view-toggle" role="group" aria-label="Layout">
          <button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => changeView('grid')} aria-label="Grid view">
            <LayoutGrid size={15} />
          </button>
          <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => changeView('list')} aria-label="List view">
            <List size={15} />
          </button>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} /> Add site
        </button>
      </div>

      {sitesLoading ? (
        <section className="card card-flush">
          <RowSkeletons />
        </section>
      ) : sites.length === 0 ? (
        <div className="card">
          <EmptyState icon={Globe} title="No sites yet" action={<button className="btn btn-primary" onClick={onAdd}><Plus size={15} /> Add your first site</button>}>
            Provision a WordPress site with its own database, HTTPS certificate and PHP version.
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Search} title="No matching sites">
            Nothing matches “{query}”{php !== 'all' ? ` on PHP ${php}` : ''}.
          </EmptyState>
        </div>
      ) : view === 'grid' ? (
        <div className="site-grid">
          {filtered.map((site) => (
            <SiteCard key={site.name} site={site} status={statusBySite[site.domain]} onManage={onManage} />
          ))}
        </div>
      ) : (
        <section className="card card-flush">
          <ul className="site-rows">
            {filtered.map((site) => (
              <SiteRow key={site.name} site={site} status={statusBySite[site.domain]} onManage={onManage} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function stateTone(state) {
  if (state === 'running') return 'success';
  if (state === 'unhealthy' || state === 'restarting') return 'warning';
  return 'danger';
}

export function ServicesPage({ sites, services, status, onOpenTool, onShowLogs, onRefresh, onRestart, onShowDetails, restarting }) {
  const merged = mergeServices(services, phpInUse(sites));
  const idlePhp = idlePhpVersions(services, phpInUse(sites));
  const loading = !status.checkedAt;

  return (
    <div className="page">
      <div className="toolbar">
        <p className="muted">
          {loading ? 'Checking containers…' : `${merged.filter((s) => s.state === 'running').length} of ${merged.length} running`}
          {status.checkedAt && <span className="dim"> · checked {status.checkedAt.toLocaleTimeString()}</span>}
        </p>
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={status.loading}>
          <RefreshCw size={15} className={status.loading ? 'spin' : ''} /> Re-check
        </button>
      </div>

      <div className="service-grid">
        {merged.map((svc) => {
          const info = serviceInfo(svc.service);
          const Icon = info.icon;
          const busy = restarting.includes(svc.service);
          const tone = loading ? 'muted' : busy ? 'warning' : stateTone(svc.state);
          return (
            <article key={svc.service} className="service-card">
              <div className="service-card-head">
                <span className={`service-icon tone-${tone}`}>
                  <Icon size={18} />
                </span>
                <div className="service-card-title">
                  <strong>{info.label}</strong>
                  <span>{info.role}</span>
                </div>
                {loading ? (
                  <Skeleton width={64} height={20} radius={999} />
                ) : (
                  <Chip tone={tone}>
                    <StatusDot tone={tone} pulse={busy} />
                    {busy ? 'restarting' : svc.state}
                  </Chip>
                )}
              </div>
              <div className="service-card-meta">
                <div className="service-card-meta-text">
                  <span className="mono">{svc.container}</span>
                  {!loading && <span>{svc.status}</span>}
                </div>
                <div className="chips">
                  {svc.ports.map((p) => (
                    <Chip key={p} mono title={`Published on localhost:${p}`}>
                      :{p}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="service-card-foot">
                <div className="service-card-actions">
                  {info.tool && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenTool(info.tool)}>
                      Open <ArrowUpRight size={14} />
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowLogs(svc.service)} disabled={svc.state === 'stopped'}>
                    <ScrollText size={14} /> Logs
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowDetails(svc.service)} disabled={svc.state === 'stopped'}>
                    <Info size={14} /> Details
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRestart(svc.service)}
                    disabled={busy || loading || svc.state === 'stopped'}
                    title={svc.state === 'stopped' ? 'Not running -- use Up to start the stack' : `Restart ${info.label}`}
                  >
                    {busy ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />} Restart
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && idlePhp.length > 0 && (
        <p className="muted small idle-php">
          <Info size={14} /> PHP {idlePhp.join(', ')} {idlePhp.length === 1 ? 'is' : 'are'} available too, not running: a PHP
          version starts when a site uses it, and stops when its last site is removed.
        </p>
      )}

      {status.raw && <RawOutput command="wpdev status" text={status.raw} />}
    </div>
  );
}

// The untouched terminal output behind a toggle. Opening it scrolls it
// into view -- it sits below a page of cards, so otherwise nothing on
// screen changes and the click looks like it did nothing.
function RawOutput({ command, text }) {
  return (
    <details
      className="raw-output"
      onToggle={(e) => {
        const el = e.currentTarget;
        if (el.open) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }}
    >
      <summary>
        <TerminalIcon size={14} /> Raw <code>{command}</code> output
      </summary>
      <Terminal lines={stripAnsiToLines(text)} />
    </details>
  );
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

const CHECK_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle, info: Info };

export function DoctorPage({ doctor, onRun }) {
  const { loading, result, raw, error, ranAt } = doctor;
  // Follow the checks down the page as they stream in, unless you've
  // scrolled up to read one.
  useFollowPage(raw, loading);
  const counts = result?.counts;
  const verdict = !counts || loading
    ? null
    : counts.error > 0
      ? { tone: 'danger', icon: XCircle, title: `${counts.error} thing${counts.error > 1 ? 's' : ''} need fixing`, text: 'Each failed check below says what is wrong.' }
      : counts.warn > 0
        ? { tone: 'warning', icon: AlertTriangle, title: `${counts.warn} thing${counts.warn > 1 ? 's' : ''} worth a look`, text: 'Nothing is broken, but these may cause trouble.' }
        : { tone: 'success', icon: CheckCircle2, title: 'Everything checks out', text: `All ${counts.ok} checks passed.` };

  return (
    <div className="page">
      <section className={`doctor-hero${verdict ? ` tone-${verdict.tone}` : ''}`}>
        <span className="doctor-hero-icon">
          {verdict ? <verdict.icon size={26} /> : <Stethoscope size={26} />}
        </span>
        <div className="doctor-hero-text">
          <h2>{loading ? `Running checks… ${counts ? counts.ok + counts.warn + counts.error : 0} done` : verdict ? verdict.title : 'Health check'}</h2>
          <p>
            {verdict ? verdict.text : 'Checks Docker, the containers, certificates, /etc/hosts, file permissions and every site database.'}
            {ranAt && <span className="dim"> · ran {ranAt.toLocaleTimeString()}</span>}
          </p>
        </div>
        {counts && (
          <div className="doctor-counts">
            <Chip tone="success" icon={CheckCircle2}>{counts.ok}</Chip>
            <Chip tone="warning" icon={AlertTriangle}>{counts.warn}</Chip>
            <Chip tone="danger" icon={XCircle}>{counts.error}</Chip>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> {loading ? 'Running' : 'Run again'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {(!result || result.sections.length === 0) && loading && (
        <section className="card">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="check" key={i}>
              <Skeleton width={18} height={18} radius={999} />
              <Skeleton width={`${40 + i * 9}%`} />
            </div>
          ))}
        </section>
      )}

      {result?.sections.map((section) => (
        <section className="card" key={section.title}>
          <div className="card-head">
            <h2>{section.title}</h2>
          </div>
          {section.groups.map((group, gi) =>
            group.items.length === 0 ? null : (
              <div className="check-group" key={gi}>
                {group.title && <h3 className="check-group-title mono">{group.title}</h3>}
                <ul className="checks">
                  {group.items.map((item, ii) => {
                    const Icon = CHECK_ICON[item.level];
                    return (
                      <li key={ii} className={`check check-${item.level}`}>
                        <Icon size={16} />
                        <span>{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )}
        </section>
      ))}

      {raw && <RawOutput command="wpdev doctor" text={raw} />}
    </div>
  );
}
