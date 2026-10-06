import { siteUrl } from '../api';

// Parses wpdev list's one-line-per-site format:
//   "  https://mysite.test  →  sites/mysite  (provisioned, php 8.2)"
// (or https://mysite.test:8444 when nginx isn't on 443 -- the port is
// matched but not captured, since links are rebuilt by siteUrl).
// Deliberately simple regex, not a general parser -- this is the one
// stable, single-line-per-site format wpdev prints. WordPress/MySQL
// versions come from a separate, much-less-frequent fetch of `status`'s
// own table (see App.jsx's refreshVersions) and are merged in by domain,
// since getting them means wpdev running a real `wp core version` per
// site -- not something to redo on this list's own fast poll cycle.
const SITE_LINE_RE = /https:\/\/([a-z0-9.-]+)(?::\d+)?\s*(?:→|->)\s*sites\/([a-z0-9-]+)\s*\(([^)]*)\)/i;

const PHP_RE = /php\s+([0-9.]+)/i;

export function parseSites(stdout) {
  return stdout
    .split('\n')
    .map((line) => SITE_LINE_RE.exec(line))
    .filter(Boolean)
    .map((m) => {
      const statusText = m[3];
      const phpMatch = PHP_RE.exec(statusText);
      return {
        domain: m[1],
        name: m[2],
        php: phpMatch ? phpMatch[1] : null,
        // The rest of the status text, minus the PHP clause already shown
        // as its own badge -- e.g. "provisioned, php 8.2" -> "provisioned".
        note: statusText.replace(/,?\s*php\s+[0-9.]+/i, '').trim(),
      };
    });
}

export default function SitesPanel({ sites, versions, onAdd, onManage }) {
  // The same MySQL server backs every site, so its version is identical in
  // every entry `versions` has -- shown once here instead of repeated on
  // every row, which would just look like N separate facts instead of one.
  const mysqlVersion = Object.values(versions || {}).find((v) => v.mysql && v.mysql !== 'n/a')?.mysql;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Sites</h2>
        <div className="panel-header-actions">
          {mysqlVersion && <span className="muted mono">MySQL {mysqlVersion}</span>}
          <button onClick={onAdd}>+ Add site</button>
        </div>
      </div>
      {sites.length === 0 ? (
        <p className="muted">No sites yet — click "Add site" to provision one.</p>
      ) : (
        <ul className="sites-list">
          {sites.map((site) => {
            const wpVersion = versions?.[site.domain]?.wp;
            return (
              <li key={site.name} className="site-row">
                <div className="site-identity">
                  <a
                    className="site-domain"
                    href={siteUrl(site.domain)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {site.domain}
                  </a>
                  <span className="site-note">{site.note}</span>
                </div>
                {wpVersion && wpVersion !== 'n/a' && <span className="badge">WP {wpVersion}</span>}
                {site.php && <span className="badge">PHP {site.php}</span>}
                <button className="secondary small" onClick={() => onManage(site)}>
                  Manage
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
