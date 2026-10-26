// Thin client for the wpdev API (../api/server.js) -- no logic of its own
// beyond building requests and parsing SSE frames. Every value shown in the
// UI comes straight from wpdev's own output.

const DEFAULT_BASE = 'http://localhost:39005';

function apiBase() {
  return (window.__WPDEV_API_BASE__ && window.__WPDEV_API_BASE__.trim()) || DEFAULT_BASE;
}

// Set by config.js (rendered from .env's APP_VERSION on every container
// start -- see docker-entrypoint.sh) to `git describe`'s output for this
// checkout. Null in `npm run dev`, where config.js doesn't exist at all
// (same as apiBase's DEFAULT_BASE fallback above).
export function appVersion() {
  return window.__WPDEV_APP_VERSION__ || null;
}

// A site's base URL, with :<port> only when nginx isn't on 443 -- same
// rule as wpdev's own site_url, from the NGINX_HTTPS_PORT config.js was
// rendered with. A bare https://<domain> on a non-default port sends the
// browser to :443, where nothing listens.
export function siteUrl(domain) {
  const port = (window.__WPDEV_HTTPS_PORT__ || '').trim();
  return port && port !== '443' ? `https://${domain}:${port}` : `https://${domain}`;
}

export function getToken() {
  return localStorage.getItem('wpdev_api_token') || '';
}

export function setToken(token) {
  if (token) localStorage.setItem('wpdev_api_token', token);
  else localStorage.removeItem('wpdev_api_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  base: apiBase,
  health: () => request('GET', '/api/health'),
  settings: () => request('GET', '/api/settings'),
  checkDomain: (domain) => request('GET', `/api/check-domain?domain=${encodeURIComponent(domain)}`),
  systemStats: () => request('GET', '/api/system/stats'),
  status: () => request('GET', '/api/status'),
  doctor: () => request('GET', '/api/doctor'),
  sites: () => request('GET', '/api/sites'),
  hosts: () => request('GET', '/api/hosts'),
  creds: (name) => request('GET', `/api/sites/${name}/creds`),
  cert: (name) => request('POST', `/api/sites/${name}/cert`),
  fixPerms: (name) => request('POST', `/api/sites/${name}/fix-perms`),
  openFolder: (name, editor) => request('POST', `/api/sites/${name}/open`, editor ? { editor } : undefined),
  mediaProxyStatus: (name) => request('GET', `/api/sites/${name}/media-proxy`),
  mediaProxy: (name, body) => request('POST', `/api/sites/${name}/media-proxy`, body),
  adminDomainStatus: (name) => request('GET', `/api/sites/${name}/admin-domain`),
  adminDomain: (name, body) => request('POST', `/api/sites/${name}/admin-domain`, body),
  linked: (name) => request('GET', `/api/sites/${name}/linked`),
  // opts: {to?, name?, writable?}; `to` is where it goes in the site.
  link: (name, folder, opts = {}) => request('POST', `/api/sites/${name}/linked`, { folder, ...opts }),
  // linkPath: the link's path in the site (wp-content/uploads), or its folder name.
  unlink: (name, linkPath) => request('DELETE', `/api/sites/${name}/linked/${encodeURIComponent(linkPath)}`),
  hostFolders: (path) => request('GET', `/api/host-folders${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  snapshots: (name) => request('GET', `/api/sites/${name}/snapshots`),
  wpCli: (name, args) => request('POST', `/api/sites/${name}/wp`, { args }),
  cacheStatus: (name) => request('GET', `/api/sites/${name}/cache`),
  cache: (name, mode) => request('POST', `/api/sites/${name}/cache`, { mode }),
  cachePurge: () => request('POST', '/api/cache/purge'),
  stackUp: () => request('POST', '/api/stack/up'),
  stackDown: () => request('POST', '/api/stack/down'),
  stackRestart: () => request('POST', '/api/stack/restart'),
  restartService: (service) => request('POST', `/api/services/${encodeURIComponent(service)}/restart`),
  updateCheck: (refresh) => request('GET', `/api/update-check${refresh ? '?refresh=1' : ''}`),
  dockerStats: () => request('GET', '/api/docker/stats'),
  dockerImages: () => request('GET', '/api/docker/images'),
  pruneImages: () => request('POST', '/api/docker/images/prune'),
  removeImage: (id) => request('POST', `/api/docker/images/${encodeURIComponent(id)}/remove`),
  dockerVolumes: () => request('GET', '/api/docker/volumes'),
  removeVolume: (name) => request('DELETE', `/api/docker/volumes/${encodeURIComponent(name)}`),
  inspectService: (service) => request('GET', `/api/services/${encodeURIComponent(service)}/inspect`),
  reloadNginx: () => request('POST', '/api/reload-nginx'),
  dbTables: (name) => request('GET', `/api/sites/${name}/db/tables`),
  dbExport,
  dbImport,
  backups: (name) => request('GET', `/api/sites/${name}/backups`),
  // suffix (optional) ends the file name instead of "manual".
  backupNow: (name, suffix) => request('POST', `/api/sites/${name}/backups`, suffix ? { suffix } : undefined),
  backupSchedule: (name, body) => request('PUT', `/api/sites/${name}/backups/schedule`, body),
  restoreBackup: (name, file) => request('POST', `/api/sites/${name}/backups/${encodeURIComponent(file)}/restore`),
  deleteBackup: (name, file) => request('DELETE', `/api/sites/${name}/backups/${encodeURIComponent(file)}`),
  downloadBackup,
  debug: (name) => request('GET', `/api/sites/${name}/debug`),
  setDebug: (name, body) => request('PUT', `/api/sites/${name}/debug`, body),
  debugLog: (name, lines) => request('GET', `/api/sites/${name}/debug/log?lines=${lines}`),
  clearDebugLog: (name) => request('DELETE', `/api/sites/${name}/debug/log`),
  downloadDebugLog,
  shares: () => request('GET', '/api/shares'),
  power: (name) => request('GET', `/api/sites/${name}/power`),
  setPower: (name, body) => request('PUT', `/api/sites/${name}/power`, body),
  share: (name) => request('GET', `/api/sites/${name}/share`),
  startShare: (name, body) => request('PUT', `/api/sites/${name}/share`, body),
  stopShare: (name) => request('DELETE', `/api/sites/${name}/share`),
  qrCode,
  links: {
    adminer: (site) => request('GET', `/api/links/adminer${site ? `?site=${encodeURIComponent(site)}` : ''}`),
    mailpit: () => request('GET', '/api/links/mailpit'),
  },
};

// The site's database as a dump, fetched rather than linked so the
// Authorization header goes along, then handed to the browser to save.
// `tables` limits it to those; omitted, it's every table. `format` is
// 'sql.gz' (the default), 'gz' or 'sql'; exportFileName says what it's
// saved as.
async function dbExport(name, tables, format = 'sql.gz') {
  const params = new URLSearchParams({ format });
  if (tables) params.set('tables', tables.join(','));
  const res = await fetch(`${apiBase()}/api/sites/${name}/db/export?${params}`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName(name, format);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { size: blob.size, filename: a.download };
}

// What an export is saved as, stamped with local time:
//   sql.gz / sql  site_20261025-1530.sql.gz
//   gz            backup_2026-10-25-1530_site_<12 hex>-db.gz -- an
//                 UpdraftPlus database backup's name, which its "Upload
//                 backup files" accepts. The 12 hex are random unless
//                 `hex` is given (a preview passes a placeholder).
export function exportFileName(name, format, hex) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())];
  const hm = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  if (format !== 'gz') return `${name}_${ymd.join('')}-${hm}.${format}`;
  const id = hex || [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `backup_${ymd.join('-')}-${hm}_${name}_${id}-db.gz`;
}

// One of the site's backups, saved by the browser under its own name.
async function downloadBackup(name, file) {
  const res = await fetch(`${apiBase()}/api/sites/${name}/backups/${encodeURIComponent(file)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// A QR code for <text> as an object URL for an <img> (fetched, so the
// Authorization header goes along). The caller revokes it.
async function qrCode(text) {
  const res = await fetch(`${apiBase()}/api/qr?text=${encodeURIComponent(text)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

async function downloadDebugLog(name) {
  const res = await fetch(`${apiBase()}/api/sites/${name}/debug/log/download`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.status === 404 ? 'There is no debug.log yet' : `HTTP ${res.status}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = `${name}-debug.log`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Uploads a .sql/.sql.gz dump over the site's database. XHR rather than
// fetch, for upload progress: onUpload(0..1) while the file goes up. Then
// wpdev's output arrives as Server-Sent Events on the same response (read
// as it grows): onLine({stream, line}) per line -- its steps and
// "PROGRESS <n>" lines. Resolves with {code, stdout, stderr} when it exits
// 0, rejects with that as err.data otherwise.
// `tables` replaces just those, keeping the rest; omitted, the whole
// database is replaced.
function dbImport(name, file, { tables, rewriteUrls, onUpload, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('rewriteUrls', rewriteUrls ? '1' : '0');
    form.append('filename', file.name);
    if (tables) form.append('tables', tables.join(','));
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase()}/api/sites/${name}/db/import?stream=1`);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    let uploaded = false;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      if (e.loaded >= e.total) uploaded = true;
      onUpload?.(e.loaded / e.total);
    };

    let seen = 0;
    let done = null;
    const isStream = () => (xhr.getResponseHeader('Content-Type') || '').startsWith('text/event-stream');
    const readFrames = () => {
      if (!isStream()) return;
      let idx;
      while ((idx = xhr.responseText.indexOf('\n\n', seen)) !== -1) {
        parseSSEFrame(xhr.responseText.slice(seen, idx), { onLine, onDone: (d) => (done = d) });
        seen = idx + 2;
      }
    };
    xhr.onprogress = readFrames;
    xhr.onerror = () =>
      reject(
        new Error(
          uploaded || seen > 0
            ? 'Lost the connection to the API during the import. wpdev keeps going on its own: check the tables above again in a few minutes.'
            : 'Upload failed: the API is unreachable',
        ),
      );
    xhr.onload = () => {
      if (isStream()) {
        readFrames();
        if (done && done.code === 0) return resolve(done);
        const err = new Error(done ? `wpdev exited with code ${done.code}` : 'The import stopped without a result');
        err.data = done || {};
        return reject(err);
      }
      // An error before wpdev started (a bad table list...) is plain JSON.
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { raw: xhr.responseText };
      }
      const err = new Error(data.error || `HTTP ${xhr.status}`);
      err.status = xhr.status;
      err.data = data;
      reject(err);
    };
    xhr.send(form);
  });
}

// Streams a Server-Sent-Events endpoint via fetch + a manual reader -- the
// browser's own EventSource can't send a POST body or an Authorization
// header, both of which every streamed wpdev action needs. Returns an abort
// function; callers get `onLine({stream, line})` per line as it's produced
// and `onDone({code})` once the underlying wpdev process exits.
export function streamSSE(method, path, body, { onLine, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${apiBase()}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        onError?.(new Error(text || `HTTP ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          parseSSEFrame(buffer.slice(0, idx), { onLine, onDone });
          buffer = buffer.slice(idx + 2);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();

  return () => controller.abort();
}

function parseSSEFrame(frame, { onLine, onDone }) {
  let event = 'message';
  let data = '';
  for (const rawLine of frame.split('\n')) {
    if (rawLine.startsWith('event:')) event = rawLine.slice(6).trim();
    else if (rawLine.startsWith('data:')) data += rawLine.slice(5).trim();
  }
  if (!data) return;
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }
  if (event === 'line') onLine?.(parsed);
  else if (event === 'done') onDone?.(parsed);
}
