// Parses wpdev list's one-line-per-site format:
//   "  https://mysite.test  →  sites/mysite  (provisioned, php 8.2)"
// Deliberately simple regex, not a general parser -- this is the one
// stable, single-line-per-site format wpdev prints; the richer per-site
// table (`status`) is shown as a raw terminal view instead of parsed (see
// Header's Status button), since its columns are fixed-width/ANSI text
// meant for a terminal, not a stable data format.
const SITE_LINE_RE = /https:\/\/([a-z0-9.-]+)\s*(?:→|->)\s*sites\/([a-z0-9-]+)\s*\(([^)]*)\)/i;

export function parseSites(stdout) {
  return stdout
    .split('\n')
    .map((line) => SITE_LINE_RE.exec(line))
    .filter(Boolean)
    .map((m) => ({ domain: m[1], name: m[2], statusText: m[3] }));
}

export default function SitesPanel({ sites, onAdd, onManage }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Sites</h2>
        <button onClick={onAdd}>+ Add site</button>
      </div>
      {sites.length === 0 ? (
        <p className="muted">No sites yet. Click "Add site" to provision one.</p>
      ) : (
        <table className="sites-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.name}>
                <td>
                  <a href={`https://${site.domain}`} target="_blank" rel="noreferrer">
                    {site.domain}
                  </a>
                </td>
                <td className="muted">{site.statusText}</td>
                <td>
                  <button className="secondary small" onClick={() => onManage(site)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
