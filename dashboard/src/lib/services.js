import { Server, Database, Zap, Mail, Container, Code2, Terminal, LayoutDashboard, Table2, Box } from 'lucide-react';

// What each compose service is for, for display only. A service missing
// from `docker compose ps` is shown as stopped; one not listed here still
// shows up (with a generic icon) if compose reports it.
export const SERVICE_INFO = {
  nginx: { label: 'Nginx', role: 'Web server and HTTPS for every site', icon: Server },
  mysql: { label: 'MySQL', role: 'Databases for every site', icon: Database },
  redis: { label: 'Redis', role: 'Object cache', icon: Zap },
  php81: { label: 'PHP 8.1', role: 'PHP-FPM', icon: Code2 },
  php82: { label: 'PHP 8.2', role: 'PHP-FPM', icon: Code2 },
  php83: { label: 'PHP 8.3', role: 'PHP-FPM', icon: Code2 },
  php84: { label: 'PHP 8.4', role: 'PHP-FPM', icon: Code2 },
  mailpit: { label: 'Mailpit', role: 'Catches every email the sites send', icon: Mail, tool: 'mailpit' },
  adminer: { label: 'Adminer', role: 'Database browser', icon: Table2, tool: 'adminer' },
  portainer: { label: 'Portainer', role: 'Container management UI', icon: Container, tool: 'portainer' },
  api: { label: 'API', role: 'Runs wpdev for this dashboard', icon: Terminal },
  dashboard: { label: 'Dashboard', role: 'This page', icon: LayoutDashboard },
};

export function serviceInfo(name) {
  return SERVICE_INFO[name] || { label: name, role: 'Container', icon: Box };
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
