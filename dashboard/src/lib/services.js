import { Server, Database, Zap, Mail, Code2, Terminal, LayoutDashboard, Table2, Box } from 'lucide-react';

// What each compose service is for, for display only. A service missing
// from `docker compose ps` is shown as stopped; one not listed here still
// shows up (with a generic icon) if compose reports it.
export const SERVICE_INFO = {
  nginx: { label: 'Nginx', role: 'Web server and HTTPS for every site', icon: Server, impact: 'Every site is unreachable for a few seconds.' },
  mysql: { label: 'MySQL', role: 'Databases for every site', icon: Database, impact: 'Every site shows a database error until MySQL is back, usually a few seconds.' },
  redis: { label: 'Redis', role: 'Object cache', icon: Zap, impact: 'The object cache starts empty, so the next page loads are slower while it refills.' },
  php74: { label: 'PHP 7.4', role: 'PHP-FPM', icon: Code2, php: '7.4', impact: 'Sites on PHP 7.4 return errors for a few seconds.' },
  php80: { label: 'PHP 8.0', role: 'PHP-FPM', icon: Code2, php: '8.0', impact: 'Sites on PHP 8.0 return errors for a few seconds.' },
  php81: { label: 'PHP 8.1', role: 'PHP-FPM', icon: Code2, php: '8.1', impact: 'Sites on PHP 8.1 return errors for a few seconds.' },
  php82: { label: 'PHP 8.2', role: 'PHP-FPM', icon: Code2, php: '8.2', impact: 'Sites on PHP 8.2 return errors for a few seconds.' },
  php83: { label: 'PHP 8.3', role: 'PHP-FPM', icon: Code2, php: '8.3', impact: 'Sites on PHP 8.3 return errors for a few seconds.' },
  php84: { label: 'PHP 8.4', role: 'PHP-FPM', icon: Code2, php: '8.4', impact: 'Sites on PHP 8.4 return errors for a few seconds.' },
  php85: { label: 'PHP 8.5', role: 'PHP-FPM', icon: Code2, php: '8.5', impact: 'Sites on PHP 8.5 return errors for a few seconds.' },
  mailpit: { label: 'Mailpit', role: 'Catches every email the sites send', icon: Mail, tool: 'mailpit', impact: 'Mail sent while it restarts is lost.' },
  adminer: { label: 'Adminer', role: 'Database browser', icon: Table2, tool: 'adminer' },
  api: { label: 'API', role: 'Runs wpdev for this dashboard', icon: Terminal, impact: 'This dashboard shows “unreachable” for a few seconds, then reconnects on its own.' },
  dashboard: { label: 'Dashboard', role: 'This page', icon: LayoutDashboard, impact: 'This page keeps working; reloading it during the restart fails for a few seconds.' },
};

export function serviceInfo(name) {
  return SERVICE_INFO[name] || { label: name, role: 'Container', icon: Box };
}

// What restarting a service interrupts, for its confirmation dialog.
export function restartImpact(name) {
  return SERVICE_INFO[name]?.impact || 'It is unavailable for a few seconds.';
}

// PHP versions run on demand: only those some site uses are expected.
export const PHP_VERSIONS = Object.values(SERVICE_INFO)
  .map((i) => i.php)
  .filter(Boolean);

// End of life (no more security fixes from php.net): fine for matching an
// old production server locally, worth flagging when choosing one.
export const PHP_EOL = new Set(['7.4', '8.0', '8.1']);

export function phpSlug(version) {
  return `php${version.replace('.', '')}`;
}

// Known services first, in SERVICE_INFO's order, with any compose reports
// that aren't known appended -- so a stopped core service is visible
// rather than silently missing from the list. A PHP version is listed only
// when it's running or some site needs it (`phpInUse`, versions like
// "8.2"): the others aren't missing, just not started until a site uses
// them.
export function mergeServices(reported, phpInUse = []) {
  const byName = new Map((reported || []).map((s) => [s.service, s]));
  const needed = new Set(phpInUse.map(phpSlug));
  const known = Object.keys(SERVICE_INFO)
    .filter((name) => !SERVICE_INFO[name].php || byName.has(name) || needed.has(name))
    .map((name) => byName.get(name) || { service: name, container: `wp-${name}`, status: 'Not running', state: 'stopped', ports: [] });
  const extra = (reported || []).filter((s) => !SERVICE_INFO[s.service]);
  return [...known, ...extra];
}

// PHP versions not running and not needed -- started when a site uses one.
export function idlePhpVersions(reported, phpInUse = []) {
  const running = new Set((reported || []).map((s) => s.service));
  return PHP_VERSIONS.filter((v) => !running.has(phpSlug(v)) && !phpInUse.includes(v));
}
