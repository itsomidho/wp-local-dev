// Parses wpdev list's one-line-per-site format:
//   "  https://mysite.test  →  sites/mysite  (provisioned, php 8.2)"
// Deliberately simple regex, not a general parser -- this is the one
// stable, single-line-per-site format wpdev prints; the richer per-site
// table (`status`) is shown as a raw terminal view instead of parsed (see
// Header's Status button), since its columns are fixed-width/ANSI text
// meant for a terminal, not a stable data format.
const SITE_LINE_RE = /https:\/\/([a-z0-9.-]+)\s*(?:→|->)\s*sites\/([a-z0-9-]+)\s*\(([^)]*)\)/i;

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

export default function SitesPanel({ sites, onAdd, onManage }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Sites</h2>
        <button onClick={onAdd}>+ Add site</button>
      </div>
      {sites.length === 0 ? (
        <p className="muted">No sites yet — click "Add site" to provision one.</p>
      ) : (
        <ul className="sites-list">
          {sites.map((site) => (
            <li key={site.name} className="site-row">
              <div className="site-identity">
                <a
                  className="site-domain"
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {site.domain}
                </a>
                <span className="site-note">{site.note}</span>
              </div>
              {site.php && <span className="badge">PHP {site.php}</span>}
              <button className="secondary small" onClick={() => onManage(site)}>
                Manage
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
