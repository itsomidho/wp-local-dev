// Parsers for wpdev's own text output. Every value the dashboard shows
// comes from wpdev -- these only reshape stable, documented formats into
// objects; none of them re-derive a status wpdev didn't print.

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return (text || '').replace(ANSI_RE, '');
}

// `wpdev list`, one line per site:
//   "  https://mysite.test  →  sites/mysite  (provisioned, php 8.2)"
// (or https://mysite.test:8444 when nginx isn't on 443 -- the port is
// matched but not captured, since links are rebuilt by siteUrl).
const SITE_LINE_RE = /https:\/\/([a-z0-9.-]+)(?::\d+)?\s*(?:→|->)\s*sites\/([a-z0-9-]+)\s*\(([^)]*)\)/i;
const PHP_RE = /php\s+([0-9.]+)/i;

export function parseSites(stdout) {
  return stripAnsi(stdout)
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
        // The rest of the status text, minus the PHP clause shown as its
        // own chip -- e.g. "provisioned, php 8.2" -> "provisioned".
        note: statusText.replace(/,?\s*php\s+[0-9.]+/i, '').trim(),
      };
    });
}

// The per-site table `wpdev status` prints after "=== Sites ===":
//   DOMAIN                       PHP    WP        MYSQL     HTTP   DATABASE   CACHE
//   mysite.test                  8.2    6.9.1     8.0.44    200    OK         Connected
// Fixed-width via printf on the wpdev side, so every field is one token.
const SITES_HEADER_RE = /^DOMAIN\s+PHP\s+WP\s+MYSQL\s+HTTP\s+DATABASE\s+CACHE\s*$/;
const SITES_ROW_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;

export function parseStatusSites(stdout) {
  const lines = stripAnsi(stdout).split('\n');
  const headerIdx = lines.findIndex((l) => SITES_HEADER_RE.test(l.trim()));
  if (headerIdx === -1) return null;

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const m = SITES_ROW_RE.exec(lines[i].trim());
    if (!m) continue;
    rows.push({ domain: m[1], php: m[2], wp: m[3], mysql: m[4], http: m[5], database: m[6], cache: m[7] });
  }
  return rows;
}

// The `docker compose ps` table at the top of `wpdev status`. Its columns
// are aligned to the header (Go's tabwriter), and IMAGE/COMMAND/CREATED/
// STATUS all contain spaces, so columns are cut at the header's offsets
// rather than split on whitespace.
const PS_HEADER_RE = /^NAME\s+IMAGE\s+COMMAND\s+SERVICE\s+CREATED\s+STATUS\s+PORTS\s*$/;

export function parseServices(stdout) {
  const lines = stripAnsi(stdout).split('\n');
  const headerIdx = lines.findIndex((l) => PS_HEADER_RE.test(l));
  if (headerIdx === -1) return null;

  const header = lines[headerIdx];
  const at = (name) => header.indexOf(name);
  const cols = { image: at('IMAGE'), service: at('SERVICE'), created: at('CREATED'), status: at('STATUS'), ports: at('PORTS') };

  const services = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break; // the table ends at the first blank line
    const status = line.slice(cols.status, cols.ports).trim();
    const ports = line.slice(cols.ports).trim();
    services.push({
      container: line.slice(0, cols.image).trim(),
      image: line.slice(cols.image, line.indexOf(' ', cols.image)).trim(),
      service: line.slice(cols.service, cols.created).trim(),
      status,
      state: serviceState(status),
      // Host-published ports only (what someone can actually open), once
      // each -- docker lists the IPv4 and IPv6 bindings separately.
      ports: [...new Set([...ports.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1):(\d+)->/g)].map((m) => m[1]))],
    });
  }
  return services;
}

function serviceState(status) {
  if (/unhealthy/i.test(status)) return 'unhealthy';
  if (/^up/i.test(status)) return 'running';
  if (/restarting/i.test(status)) return 'restarting';
  return 'stopped';
}

// `wpdev doctor`: "=== Section ===" headings, optional "domain.test:"
// sub-groups, and one check per line led by wpdev's print_* glyph
// (✓ ok, ⚠ warning, ✗ error). Anything else (e.g. "Disk: sites/ = 2.8G")
// is kept as an info line so nothing doctor said is dropped.
export function parseDoctor(stdout) {
  const sections = [];
  let section = null;
  let group = null;

  for (const raw of stripAnsi(stdout).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const heading = /^===\s*(.+?)\s*===$/.exec(line.trim());
    if (heading) {
      section = { title: heading[1], groups: [{ title: null, items: [] }] };
      group = section.groups[0];
      sections.push(section);
      continue;
    }
    if (!section) {
      section = { title: 'General', groups: [{ title: null, items: [] }] };
      group = section.groups[0];
      sections.push(section);
    }

    const check = /^\s*([✓⚠✗])\s+(.*)$/.exec(line);
    // Doctor's own verdict, not a check -- the counts below are the verdict.
    if (check && check[2].trim() === 'Everything checks out.') continue;
    if (check) {
      const level = check[1] === '✓' ? 'ok' : check[1] === '⚠' ? 'warn' : 'error';
      group.items.push({ level, text: check[2].trim() });
      continue;
    }
    const sub = /^(\S+):$/.exec(line.trim());
    if (sub && !line.startsWith(' ')) {
      group = { title: sub[1], items: [] };
      section.groups.push(group);
      continue;
    }
    group.items.push({ level: 'info', text: line.trim() });
  }

  // "=== Summary ===" only restates the totals ("2 thing(s) need fixing"),
  // which would otherwise count as checks themselves.
  const checks = sections.filter((s) => s.title !== 'Summary');
  const all = checks.flatMap((s) => s.groups.flatMap((g) => g.items));
  return {
    sections: checks,
    counts: {
      ok: all.filter((i) => i.level === 'ok').length,
      warn: all.filter((i) => i.level === 'warn').length,
      error: all.filter((i) => i.level === 'error').length,
    },
  };
}
