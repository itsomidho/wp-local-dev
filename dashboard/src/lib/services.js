import { Server, Database, Zap, Mail, Ship, Code2, Terminal, LayoutDashboard, Table2, Box } from 'lucide-react';

// What each compose service is for, for display only. A service missing
// from `docker compose ps` is shown as stopped; one not listed here still
// shows up (with a generic icon) if compose reports it.
export const SERVICE_INFO = {
  nginx: { label: 'Nginx', role: 'Web server and HTTPS for every site', icon: Server, impact: 'Every site is unreachable for a few seconds.' },
  mysql: { label: 'MySQL', role: 'Databases for every site', icon: Database, impact: 'Every site shows a database error until MySQL is back, usually a few seconds.' },
  redis: { label: 'Redis', role: 'Object cache', icon: Zap, impact: 'The object cache starts empty, so the next page loads are slower while it refills.' },
  php81: { label: 'PHP 8.1', role: 'PHP-FPM', icon: Code2, impact: 'Sites on PHP 8.1 return errors for a few seconds.' },
  php82: { label: 'PHP 8.2', role: 'PHP-FPM', icon: Code2, impact: 'Sites on PHP 8.2 return errors for a few seconds.' },
  php83: { label: 'PHP 8.3', role: 'PHP-FPM', icon: Code2, impact: 'Sites on PHP 8.3 return errors for a few seconds.' },
  php84: { label: 'PHP 8.4', role: 'PHP-FPM', icon: Code2, impact: 'Sites on PHP 8.4 return errors for a few seconds.' },
  mailpit: { label: 'Mailpit', role: 'Catches every email the sites send', icon: Mail, tool: 'mailpit', impact: 'Mail sent while it restarts is lost.' },
  adminer: { label: 'Adminer', role: 'Database browser', icon: Table2, tool: 'adminer' },
  portainer: { label: 'Portainer', role: 'Container management UI', icon: Ship, tool: 'portainer' },
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

// Known services first, in SERVICE_INFO's order, with any compose reports
// that aren't known appended -- so a stopped core service is visible
// rather than silently missing from the list.
export function mergeServices(reported) {
  const byName = new Map((reported || []).map((s) => [s.service, s]));
  const known = Object.keys(SERVICE_INFO).map(
    (name) => byName.get(name) || { service: name, container: `wp-${name}`, status: 'Not running', state: 'stopped', ports: [] },
  );
  const extra = (reported || []).filter((s) => !SERVICE_INFO[s.service]);
  return [...known, ...extra];
}
