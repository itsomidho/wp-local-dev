// The README's "Command reference" table as a list of commands, for the
// Docs page's cheatsheet. Read from the README itself, so a command added
// or changed there shows up here with nothing else to edit.

// Which group each command goes under. A command not listed here still
// shows, under "Other".
const GROUPS = [
  [
    'Stack',
    [
      'up',
      'down',
      'restart',
      'status',
      'update',
      'update-check',
      'dashboard',
      'install-mkcert',
      'clean',
      'clean-all',
      'uninstall',
    ],
  ],
  ['Sites', ['add', 'remove', 'clone', 'list', 'check-domain', 'creds', 'open', 'on', 'off', 'auto-off', 'fix-perms', 'wp']],
  ['Database', ['db', 'adminer', 'db-tables', 'db-export', 'db-import', 'backup', 'restore-all']],
  ['Backups & snapshots', ['db-backup', 'db-backups', 'snapshot', 'snapshots', 'restore']],
  ['Cache', ['cache', 'cache-purge']],
  ['Debug & mail', ['debug', 'debug-log', 'mailpit']],
  ['Sharing & domains', ['share', 'media-proxy', 'admin-domain', 'cert', 'hosts', 'update-tlds']],
  ['Docker', ['stats', 'images', 'volumes', 'inspect', 'logs', 'shell', 'reload-nginx']],
  ['Troubleshooting', ['doctor', 'fix-dns', 'fix-vpn-network']],
];
export const OTHER_GROUP = 'Other';
export const GROUP_ORDER = [...GROUPS.map(([g]) => g), OTHER_GROUP];
const GROUP_OF = new Map(GROUPS.flatMap(([g, names]) => names.map((n) => [n, g])));

// A table row's cells. `\|` inside a cell is a literal pipe, not a column.
function cells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

// [{name, syntax, description, group}] in the README's order. syntax is
// the command as written there (`wpdev cache <site> on|off`), description
// its markdown.
export function parseCommandReference(markdown) {
  const start = markdown.search(/^## Command reference\s*$/m);
  if (start === -1) return [];
  const rest = markdown.slice(start).split('\n').slice(1);
  const end = rest.findIndex((l) => /^## /.test(l));
  const section = end === -1 ? rest : rest.slice(0, end);
  const commands = [];
  for (const line of section) {
    if (!line.startsWith('|')) continue;
    const [first, description] = cells(line);
    const m = /^`(wpdev\s+([a-z][a-z0-9-]*)[^`]*)`$/.exec(first || '');
    if (!m) continue; // the header and its --- row
    commands.push({
      name: m[2],
      syntax: m[1],
      description: description || '',
      group: GROUP_OF.get(m[2]) || OTHER_GROUP,
    });
  }
  return commands;
}

// The placeholders that stand for a site, and how a chosen site fills
// them in: <site>, <site>..., <name>, <src>, and the optional [name] --
// but not a flag's value, like --suffix=<name>.
const SITE_PLACEHOLDER_RE = /<site>(?:\.\.\.)?|(?<!=)<name>|<src>|\[name\]/g;

export function hasSitePlaceholder(syntax) {
  SITE_PLACEHOLDER_RE.lastIndex = 0;
  return SITE_PLACEHOLDER_RE.test(syntax);
}

// syntax as [{text, site}] parts, with each site placeholder replaced by
// `site` (and marked, for highlighting) when one is chosen.
export function fillSite(syntax, site) {
  if (!site) return [{ text: syntax, site: false }];
  const parts = [];
  let last = 0;
  SITE_PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = SITE_PLACEHOLDER_RE.exec(syntax))) {
    if (m.index > last) parts.push({ text: syntax.slice(last, m.index), site: false });
    parts.push({ text: site, site: true });
    last = m.index + m[0].length;
  }
  if (last < syntax.length) parts.push({ text: syntax.slice(last), site: false });
  return parts;
}
