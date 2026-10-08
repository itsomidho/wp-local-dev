import { ArrowUpRight, LayoutDashboard, Settings2, Database, Layers } from 'lucide-react';
import { siteUrl } from '../api';
import { Avatar, Chip, StatusDot } from './ui';

// Reachability from `wpdev status`'s HTTP column: what nginx answered for
// the site's front page. "down" (or an older wpdev's 000) means nothing
// answered at all.
export function httpTone(code) {
  if (!code) return { tone: 'muted', label: 'Not checked yet' };
  if (code === 'down' || code === '000') return { tone: 'danger', label: 'Unreachable (no response)' };
  if (/^[23]/.test(code)) return { tone: 'success', label: `Reachable (HTTP ${code})` };
  return { tone: 'warning', label: `HTTP ${code}` };
}

function has(value) {
  return value && value !== 'n/a';
}

export function SiteChips({ site, status }) {
  const php = status?.php || site.php;
  return (
    <div className="chips">
      {php && (
        <Chip mono title="PHP version">
          PHP {php}
        </Chip>
      )}
      {has(status?.wp) && (
        <Chip mono title="WordPress core version">
          WP {status.wp}
        </Chip>
      )}
      {status?.database && (
        <Chip tone={status.database === 'OK' ? 'success' : 'danger'} icon={Database} title="Database check">
          {status.database === 'OK' ? 'DB' : `DB ${status.database}`}
        </Chip>
      )}
      {status?.cache === 'Connected' && (
        <Chip tone="info" icon={Layers} title="Redis object cache connected">
          Redis
        </Chip>
      )}
    </div>
  );
}

export default function SiteCard({ site, status, onManage }) {
  const url = siteUrl(site.domain);
  const reach = httpTone(status?.http);

  return (
    <article className="site-card">
      <header className="site-card-head">
        <Avatar name={site.name} size={42} />
        <div className="site-card-title">
          <a href={url} target="_blank" rel="noreferrer" className="site-domain">
            {site.domain}
          </a>
          <span className="site-note">
            <StatusDot tone={reach.tone} pulse={reach.tone === 'success'} label={reach.label} />
            {reach.tone === 'muted' ? site.note : reach.label}
          </span>
        </div>
      </header>

      <SiteChips site={site} status={status} />

      <footer className="site-card-actions">
        <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">
          <ArrowUpRight size={15} /> Visit
        </a>
        <a className="btn btn-ghost btn-sm" href={`${url}/wp-admin/`} target="_blank" rel="noreferrer">
          <LayoutDashboard size={15} /> Admin
        </a>
        <button type="button" className="btn btn-soft btn-sm site-card-manage" onClick={() => onManage(site)}>
          <Settings2 size={15} /> Manage
        </button>
      </footer>
    </article>
  );
}
