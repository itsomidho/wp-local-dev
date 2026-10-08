'use strict';

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runWpdev, streamWpdev, PROJECT_DIR } = require('./lib/wpdev');
const { getSystemStats } = require('./lib/systemStats');

// Always 9090 inside the container -- docker-compose.yml maps the HOST-side
// port via API_PORT; this is a container-internal detail, not something
// that needs its own separate env var.
const PORT = 9090;
const API_TOKEN = process.env.API_TOKEN || '';

const app = express();
app.use(cors());
app.use(express.json());

if (!API_TOKEN) {
  // Not fatal -- the port mapping in docker-compose.yml already restricts
  // this to 127.0.0.1 on the host. But that's the only thing stopping any
  // other local user/process on this machine from reaching it, so say so
  // loudly rather than silently running wide open.
  console.warn(
    'API_TOKEN is not set in .env -- running without auth. ' +
    'Fine if 127.0.0.1-only access is enough for your threat model; ' +
    'set API_TOKEN to require "Authorization: Bearer <token>" on every request.'
  );
}

app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  if (!API_TOKEN) return next();
  if (req.get('authorization') === `Bearer ${API_TOKEN}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Validated before a site name ever reaches a shell command -- not mainly
// for injection (spawn's argv-array + wpdev's own double-quoted bash vars
// already close that off, see lib/wpdev.js), but to block path traversal:
// wpdev interpolates this into `--path=/var/www/${site}`, so an unchecked
// "../../etc" would walk right out of the sites directory.
const SITE_NAME_RE = /^[a-z0-9-]+$/;
function requireValidSiteName(req, res, next) {
  if (!SITE_NAME_RE.test(req.params.name || '')) {
    return res.status(400).json({ error: `invalid site name '${req.params.name}'` });
  }
  next();
}

// Thin wrappers for the two response shapes every route below uses: a
// synchronous exec that waits for wpdev to finish and returns its full
// output as JSON, or an SSE stream for anything long-running/step-by-step.
const sync = (buildArgs) => async (req, res) => {
  const { code, stdout, stderr, timedOut } = await runWpdev(buildArgs(req));
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr, timedOut });
};
const stream = (buildArgs) => (req, res) => streamWpdev(buildArgs(req), res);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/system/stats', async (req, res) => {
  try {
    res.json(await getSystemStats(PROJECT_DIR));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------
app.get('/api/status', sync(() => ['status']));
app.get('/api/doctor', sync(() => ['doctor']));
app.post('/api/stack/up', sync(() => ['up']));
app.post('/api/stack/down', sync(() => ['down']));
app.post('/api/stack/restart', sync(() => ['restart']));
app.post('/api/stack/update', stream(() => ['update']));
// Not sync() -- that maps any non-zero exit to HTTP 500, but
// update-check's exit code is the result, not an error: 0 up to date, 2
// update available. Only anything else is a real failure.
app.get('/api/update-check', async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['update-check']);
  if (code !== 0 && code !== 2) {
    return res.status(500).json({ code, stdout, stderr });
  }
  res.json({ updateAvailable: code === 2, stdout, stderr });
});
// Starts from the last ?tail= lines (default 200) -- a long-running
// container's full history can be megabytes, which the dashboard would
// otherwise replay line by line before showing anything live.
app.get('/api/logs/:service', (req, res) => {
  const tail = /^\d{1,4}$/.test(req.query.tail || '') ? req.query.tail : '200';
  streamWpdev(['logs', req.params.service, `--tail=${tail}`], res);
});
app.post('/api/reload-nginx', sync(() => ['reload-nginx']));
app.post('/api/clean', sync(() => ['clean']));
app.post('/api/clean-all', sync(() => ['clean-all', '--yes']));
app.post('/api/install-mkcert', sync(() => ['install-mkcert']));

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------
app.get('/api/sites', sync(() => ['list']));

app.post('/api/sites', (req, res) => {
  const { domain, php, wpVersion } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  const args = ['add', `--domain=${domain}`];
  if (php) args.push(`--php=${php}`);
  if (wpVersion) args.push(`--wp-version=${wpVersion}`);
  streamWpdev(args, res);
});

app.delete('/api/sites/:name', requireValidSiteName, (req, res) => {
  streamWpdev(['remove', req.params.name, '--yes'], res);
});

app.post('/api/sites/:name/clone', requireValidSiteName, (req, res) => {
  const newName = req.body && req.body.newName;
  if (!SITE_NAME_RE.test(newName || '')) {
    return res.status(400).json({ error: 'newName is required and must match ^[a-z0-9-]+$' });
  }
  streamWpdev(['clone', req.params.name, newName, '--yes'], res);
});

app.get('/api/sites/:name/creds', requireValidSiteName, sync((req) => ['creds', req.params.name]));
app.post('/api/sites/:name/cert', requireValidSiteName, sync((req) => ['cert', req.params.name]));
app.post('/api/sites/:name/fix-perms', requireValidSiteName, sync((req) => ['fix-perms', req.params.name]));

// Generic WP-CLI passthrough -- the escape hatch for anything not covered by
// a dedicated endpoint. `args` is a plain array of argv elements, forwarded
// to `wp` exactly as wpdev's own `wp <site> <args...>` would.
app.post('/api/sites/:name/wp', requireValidSiteName, async (req, res) => {
  const wpArgs = Array.isArray(req.body && req.body.args) ? req.body.args : [];
  const { code, stdout, stderr } = await runWpdev(['wp', req.params.name, ...wpArgs]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

app.post('/api/sites/:name/cache', requireValidSiteName, async (req, res) => {
  const mode = req.body && req.body.mode;
  if (mode !== 'on' && mode !== 'off') {
    return res.status(400).json({ error: "mode must be 'on' or 'off'" });
  }
  const { code, stdout, stderr } = await runWpdev(['cache', req.params.name, mode]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});
app.post('/api/cache/purge', sync(() => ['cache-purge']));

// Production media proxy (`wpdev media-proxy`). GET returns wpdev's own
// status line. POST takes {mode: 'on'|'off'} or {url}; the URL is checked
// here with the same pattern wpdev enforces (it ends up in an nginx config),
// so a bad one is a 400 rather than a 500 from wpdev.
const PRODUCTION_URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[A-Za-z0-9._~/%-]*)?$/;
app.get('/api/sites/:name/media-proxy', requireValidSiteName, sync((req) => ['media-proxy', req.params.name]));
app.post('/api/sites/:name/media-proxy', requireValidSiteName, async (req, res) => {
  const { mode, url } = req.body || {};
  let arg;
  if (mode === 'on' || mode === 'off') arg = mode;
  else if (typeof url === 'string' && PRODUCTION_URL_RE.test(url.trim())) arg = url.trim();
  else {
    return res.status(400).json({
      error: "send {mode: 'on'|'off'} or {url: 'https://production.example/path'}",
    });
  }
  const { code, stdout, stderr } = await runWpdev(['media-proxy', req.params.name, arg]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// Admin domain (`wpdev admin-domain`). GET returns wpdev's own status line.
// POST takes {mode: 'on'|'off'} or {domain}; the domain is checked here
// with the same pattern wpdev enforces (it ends up in an nginx config).
const ADMIN_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
app.get('/api/sites/:name/admin-domain', requireValidSiteName, sync((req) => ['admin-domain', req.params.name]));
app.post('/api/sites/:name/admin-domain', requireValidSiteName, async (req, res) => {
  const { mode, domain } = req.body || {};
  let arg;
  if (mode === 'on' || mode === 'off') arg = mode;
  else if (typeof domain === 'string' && ADMIN_DOMAIN_RE.test(domain.trim().toLowerCase())) arg = domain.trim().toLowerCase();
  else {
    return res.status(400).json({
      error: "send {mode: 'on'|'off'} or {domain: 'admin-mysite.test'}",
    });
  }
  const { code, stdout, stderr } = await runWpdev(['admin-domain', req.params.name, arg]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

app.get('/api/sites/:name/snapshots', requireValidSiteName, sync((req) => ['snapshots', req.params.name]));

app.post('/api/sites/:name/snapshots', requireValidSiteName, (req, res) => {
  const args = ['snapshot', req.params.name];
  if (req.body && req.body.label) args.push(String(req.body.label));
  streamWpdev(args, res);
});

app.post('/api/sites/:name/restore', requireValidSiteName, (req, res) => {
  const args = ['restore', req.params.name];
  if (req.body && req.body.snapId) args.push(String(req.body.snapId));
  args.push('--yes');
  streamWpdev(args, res);
});

// ---------------------------------------------------------------------------
// Database import/export
// ---------------------------------------------------------------------------
app.get('/api/sites/:name/db/export', requireValidSiteName, async (req, res) => {
  const outFile = path.join(PROJECT_DIR, 'backups', `${req.params.name}_api_${Date.now()}.sql.gz`);
  const { code, stderr } = await runWpdev(['db-export', req.params.name, outFile]);
  if (code !== 0) return res.status(500).json({ code, stderr });
  res.download(outFile, (err) => {
    // Best-effort cleanup -- this is a copy made just for this download, not
    // the authoritative backup (that's `wpdev backup`/`db-export` run by hand).
    if (!err) fs.unlink(outFile, () => {});
  });
});

const uploadDir = path.join(PROJECT_DIR, '.api-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

app.post('/api/sites/:name/db/import', requireValidSiteName, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required (multipart field "file")' });
  const { code, stdout, stderr } = await runWpdev(['db-import', req.params.name, req.file.path, '--yes']);
  fs.unlink(req.file.path, () => {});
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// ---------------------------------------------------------------------------
// Backups (whole-stack, not per-site)
// ---------------------------------------------------------------------------
app.post('/api/backup', sync(() => ['backup']));
app.post('/api/restore-all', (req, res) => {
  const args = ['restore-all'];
  if (req.body && req.body.file) args.push(String(req.body.file));
  args.push('--yes');
  streamWpdev(args, res);
});

app.get('/api/hosts', sync(() => ['hosts']));

// ---------------------------------------------------------------------------
// Links -- these just print a URL + login hint (wpdev's own logic for
// reading the right DB_USER/DB_NAME out of wp-config.php); the attempted
// xdg-open inside this container is a harmless no-op with no browser to
// open, which is fine since the GUI opens the URL itself rather than
// parsing/duplicating that lookup logic in JS.
// ---------------------------------------------------------------------------
app.get('/api/links/adminer', sync((req) => (req.query.site ? ['adminer', String(req.query.site)] : ['adminer'])));
app.get('/api/links/portainer', sync(() => ['portainer']));
app.get('/api/links/mailpit', sync(() => ['mailpit']));

app.listen(PORT, () => {
  console.log(`wp-local-dev API listening on :${PORT} (PROJECT_DIR=${PROJECT_DIR})`);
});
