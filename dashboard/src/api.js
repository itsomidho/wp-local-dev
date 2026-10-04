// Thin client for the wpdev API (../api/server.js) -- no logic of its own
// beyond building requests and parsing SSE frames. Every value shown in the
// UI comes straight from wpdev's own output.

const DEFAULT_BASE = 'http://localhost:39006';

function apiBase() {
  return (window.__WPDEV_API_BASE__ && window.__WPDEV_API_BASE__.trim()) || DEFAULT_BASE;
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
  systemStats: () => request('GET', '/api/system/stats'),
  status: () => request('GET', '/api/status'),
  doctor: () => request('GET', '/api/doctor'),
  sites: () => request('GET', '/api/sites'),
  hosts: () => request('GET', '/api/hosts'),
  creds: (name) => request('GET', `/api/sites/${name}/creds`),
  snapshots: (name) => request('GET', `/api/sites/${name}/snapshots`),
  wpCli: (name, args) => request('POST', `/api/sites/${name}/wp`, { args }),
  cache: (name, mode) => request('POST', `/api/sites/${name}/cache`, { mode }),
  cachePurge: () => request('POST', '/api/cache/purge'),
  stackUp: () => request('POST', '/api/stack/up'),
  stackDown: () => request('POST', '/api/stack/down'),
  stackRestart: () => request('POST', '/api/stack/restart'),
  reloadNginx: () => request('POST', '/api/reload-nginx'),
  links: {
    adminer: (site) => request('GET', `/api/links/adminer${site ? `?site=${encodeURIComponent(site)}` : ''}`),
    portainer: () => request('GET', '/api/links/portainer'),
    mailpit: () => request('GET', '/api/links/mailpit'),
  },
};

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
