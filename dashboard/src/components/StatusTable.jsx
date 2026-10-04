import { useState } from 'react';
import Terminal, { stripAnsiToLines } from './Terminal';

// Parses the per-site table `wpdev status` prints after "=== Sites ===":
//   DOMAIN                       PHP    WP        MYSQL     HTTP   DATABASE   CACHE
//   mysite.test                  8.2    6.9.1     8.0.44    200    OK         Connected
// Fixed-width via printf on the wpdev side, so splitting on whitespace is
// reliable -- each field is a single token, never containing a space.
const HEADER_RE = /^DOMAIN\s+PHP\s+WP\s+MYSQL\s+HTTP\s+DATABASE\s+CACHE\s*$/;
const ROW_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;

export function parseStatusSites(stdout) {
  const lines = stdout.split('\n');
  const headerIdx = lines.findIndex((l) => HEADER_RE.test(l.trim()));
  if (headerIdx === -1) return null;

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = ROW_RE.exec(line);
    if (!m) continue;
    rows.push({ domain: m[1], php: m[2], wp: m[3], mysql: m[4], database: m[6], cache: m[7] });
  }
  return rows;
}

function dbBadgeClass(value) {
  if (value === 'OK') return 'badge badge-ok';
  if (value === 'FAIL') return 'badge badge-fail';
  return 'badge badge-muted';
}

function cacheBadgeClass(value) {
  if (value === 'Connected') return 'badge badge-ok';
  if (value === 'off' || value === 'n/a' || value === 'down') return 'badge badge-muted';
  return 'badge badge-fail';
}

// `rawOutput` is the full, unparsed wpdev status text (container list +
// this same table) -- always available behind a toggle so nothing is
// hidden, just not the first thing shown.
export default function StatusTable({ rows, rawOutput }) {
  const [showRaw, setShowRaw] = useState(false);

  if (rows === null) {
    // Parsing failed (output didn't look like we expected) -- fall back to
    // the raw view rather than show nothing.
    return <Terminal lines={stripAnsiToLines(rawOutput)} className="terminal-modal" />;
  }

  return (
    <div className="modal-body">
      {rows.length === 0 ? (
        <p className="muted">No sites configured yet.</p>
      ) : (
        <table className="status-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>PHP</th>
              <th>WordPress</th>
              <th>MySQL</th>
              <th>Database</th>
              <th>Cache</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.domain}>
                <td>
                  <a className="site-domain" href={`https://${row.domain}`} target="_blank" rel="noreferrer">
                    {row.domain}
                  </a>
                </td>
                <td className="mono muted">{row.php}</td>
                <td className="mono muted">{row.wp}</td>
                <td className="mono muted">{row.mysql}</td>
                <td>
                  <span className={dbBadgeClass(row.database)}>{row.database}</span>
                </td>
                <td>
                  <span className={cacheBadgeClass(row.cache)}>{row.cache}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="status-raw-toggle">
        <button className="ghost small" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide raw output' : 'Show raw output'}
        </button>
      </div>

      {showRaw && <Terminal lines={stripAnsiToLines(rawOutput)} className="terminal" />}
    </div>
  );
}
