'use strict';

const express = require('express');
const cors = require('cors');
const zlib = require('zlib');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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

// A plain hostname, the same pattern wpdev's valid_domain enforces: it ends
// up in nginx configs, /etc/hosts and a certificate, and WordPress rejects
// an underscore (admin@my_site.test isn't a valid email address).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
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

// The .env settings the dashboard needs. domainSuffix is what a bare site
// name gets (DOMAIN_SUFFIX, "test" if unset) -- the same default wpdev's
// domain_suffix applies, read the same way: the last assignment wins.
app.get('/api/settings', (req, res) => {
  let env = '';
  try {
    env = fs.readFileSync(path.join(PROJECT_DIR, '.env'), 'utf8');
  } catch {
    // No .env yet: defaults.
  }
  const set = [...env.matchAll(/^DOMAIN_SUFFIX=\.?(.*)$/gm)].pop()?.[1].trim();
  res.json({
    domainSuffix: set && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(set) ? set : 'test',
    // Mounted at the same path as on the host, so it's the host's path too
    // (the dashboard's "Open in VS Code" / "Copy path").
    projectDir: PROJECT_DIR,
  });
});

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
// Same checks, streamed line by line -- the dashboard shows each check as
// it finishes instead of a blank page for the whole run.
app.get('/api/doctor/stream', stream(() => ['doctor']));
app.post('/api/stack/up', sync(() => ['up']));
app.post('/api/stack/down', sync(() => ['down']));
app.post('/api/stack/restart', sync(() => ['restart']));
// One compose service (the dashboard's Services page). wpdev validates
// the name against the compose file; this only keeps it to a plain token.
app.post('/api/services/:service/restart', (req, res, next) => {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(req.params.service)) {
    return res.status(400).json({ error: 'invalid service name' });
  }
  next();
}, sync((req) => ['restart', req.params.service]));
app.post('/api/stack/update', stream(() => ['update']));
// Not sync() -- that maps any non-zero exit to HTTP 500, but
// update-check's exit code is the result, not an error: 0 up to date, 2
// update available. Only anything else is a real failure.
// Is origin ahead of this checkout? `wpdev update-check --porcelain`, plus
// the latest release's notes from GitHub. Checked when the api starts and
// every 6 hours, and kept: the dashboard asks on every load, which shouldn't
// mean a git fetch every time. ?refresh=1 checks now.
const UPDATE_CHECK_EVERY = 6 * 60 * 60 * 1000;
let updateState = null; // the last result
let updateCheckRunning = null; // its promise while a check runs

function parseUpdateCheck(stdout) {
  const kv = {};
  const changes = [];
  for (const line of stdout.split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'CHANGE') changes.push(m[2]);
    else kv[m[1]] = m[2];
  }
  return {
    // 'release' (installed from a GitHub release: no .git, updates by
    // release) or 'git' (a checkout: updates by git pull).
    install: kv.INSTALL === 'release' ? 'release' : 'git',
    current: kv.CURRENT || null,
    currentTag: kv.CURRENT_TAG || null,
    latestTag: kv.LATEST_TAG || null,
    behind: Number(kv.BEHIND) || 0,
    ahead: Number(kv.AHEAD) || 0,
    dirty: Number(kv.DIRTY) || 0,
    branch: kv.BRANCH || null,
    remote: kv.REMOTE || null,
    checkedAt: Number(kv.CHECKED_AT) * 1000 || Date.now(),
    changes,
  };
}

// The notes of <tag> from GitHub's API, when origin is a GitHub repo.
// Best-effort: null on anything unexpected.
async function releaseNotes(remote, tag) {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote || '');
  if (!m || !tag) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wp-local-dev' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const r = await res.json();
    return { tag, name: r.name || tag, body: r.body || '', url: r.html_url, publishedAt: r.published_at };
  } catch {
    return null;
  }
}

function checkForUpdates() {
  updateCheckRunning ||= (async () => {
    try {
      const { code, stdout, stderr } = await runWpdev(['update-check', '--porcelain'], { timeoutMs: 60000 });
      if (code !== 0 && code !== 2) {
        updateState = { ...(updateState || {}), error: (stderr || stdout).trim().split('\n').pop(), checkedAt: Date.now() };
        return updateState;
      }
      const info = parseUpdateCheck(stdout);
      // The latest release's notes, when it's newer than the one you have.
      const release = info.latestTag && info.latestTag !== info.currentTag ? await releaseNotes(info.remote, info.latestTag) : null;
      updateState = {
        ...info,
        release,
        updateAvailable: code === 2,
        // Kept for older dashboards, which show it as a tooltip.
        stdout: info.behind ? `Update available: ${info.latestTag || ''} (${info.behind} new change(s))` : `Up to date (${info.current}).`,
        error: null,
      };
      return updateState;
    } finally {
      updateCheckRunning = null;
    }
  })();
  return updateCheckRunning;
}

setTimeout(checkForUpdates, 30 * 1000);
setInterval(checkForUpdates, UPDATE_CHECK_EVERY);

app.get('/api/update-check', async (req, res) => {
  const stale = !updateState || Date.now() - (updateState.checkedAt || 0) > UPDATE_CHECK_EVERY;
  const state = req.query.refresh || stale ? await checkForUpdates() : updateState;
  if (!state || (state.error && state.updateAvailable === undefined)) {
    return res.status(500).json({ error: state?.error || 'the check failed' });
  }
  res.json(state);
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
// Docker resources (the dashboard's Docker page) -- this project's own
// containers, images and volumes only; wpdev enforces that, these routes
// only keep the names to plain tokens.
// ---------------------------------------------------------------------------
const plainName = (param, re) => (req, res, next) =>
  re.test(req.params[param]) ? next() : res.status(400).json({ error: `invalid ${param}` });

app.get('/api/docker/stats', sync(() => ['stats', '--json']));
app.get('/api/docker/images', sync(() => ['images', '--json']));
app.post('/api/docker/images/prune', sync(() => ['images', 'prune']));
app.post(
  '/api/docker/images/:id/remove',
  plainName('id', /^(sha256:)?[a-f0-9]{12,64}$/),
  sync((req) => ['images', 'rm', req.params.id])
);
app.get('/api/docker/volumes', sync(() => ['volumes', '--json']));
app.delete(
  '/api/docker/volumes/:name',
  plainName('name', /^[A-Za-z0-9][A-Za-z0-9_.-]*$/),
  sync((req) => ['volumes', 'rm', req.params.name, '--yes'])
);
app.get(
  '/api/services/:service/inspect',
  plainName('service', /^[a-z0-9][a-z0-9_-]*$/),
  sync((req) => ['inspect', req.params.service])
);

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------
app.get('/api/sites', sync(() => ['list']));

// Whether a domain is free for a new site (`wpdev check-domain`): the same
// check `add` makes, for the dashboard to show while the user types.
app.get('/api/check-domain', async (req, res) => {
  const domain = String(req.query.domain || '').trim().toLowerCase();
  if (!domain || domain.length > 253) return res.status(400).json({ error: 'domain is required' });
  const { code, stdout } = await runWpdev(['check-domain', domain]);
  const line = stdout.trim().split('\n').pop() || '';
  res.json({ ok: code === 0, reason: code === 0 ? null : line.slice(line.indexOf(': ') + 2) });
});

app.post('/api/sites', (req, res) => {
  const { domain, php, wpVersion } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  if (!DOMAIN_RE.test(domain)) {
    return res.status(400).json({ error: `'${domain}' isn't a usable domain: only lowercase letters, digits, hyphens and dots` });
  }
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
// {editor: 'nvim'} opens it in that editor instead of the file manager;
// wpdev keeps the list of editors it knows.
app.post(
  '/api/sites/:name/open',
  requireValidSiteName,
  sync((req) => {
    const editor = req.body?.editor;
    return typeof editor === 'string' && /^[a-z]+$/.test(editor)
      ? ['open', req.params.name, `--editor=${editor}`]
      : ['open', req.params.name];
  }),
);
app.post('/api/sites/:name/fix-perms', requireValidSiteName, sync((req) => ['fix-perms', req.params.name]));

// Generic WP-CLI passthrough -- the escape hatch for anything not covered by
// a dedicated endpoint. `args` is a plain array of argv elements, forwarded
// to `wp` exactly as wpdev's own `wp <site> <args...>` would.
app.post('/api/sites/:name/wp', requireValidSiteName, async (req, res) => {
  const wpArgs = Array.isArray(req.body && req.body.args) ? req.body.args : [];
  const { code, stdout, stderr } = await runWpdev(['wp', req.params.name, ...wpArgs]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

app.get('/api/sites/:name/cache', requireValidSiteName, sync((req) => ['cache', req.params.name, 'status']));
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
// POST takes {mode: 'on'|'off'} or {domain}; the domain is checked with
// DOMAIN_RE.
app.get('/api/sites/:name/admin-domain', requireValidSiteName, sync((req) => ['admin-domain', req.params.name]));
app.post('/api/sites/:name/admin-domain', requireValidSiteName, async (req, res) => {
  const { mode, domain } = req.body || {};
  let arg;
  if (mode === 'on' || mode === 'off') arg = mode;
  else if (typeof domain === 'string' && DOMAIN_RE.test(domain.trim().toLowerCase())) arg = domain.trim().toLowerCase();
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
// Dumps and imports scale with the database, not a request: a big one
// takes far longer than runWpdev's default two minutes.
const DB_TIMEOUT = { timeoutMs: 60 * 60 * 1000 };

// A comma-separated table list (?tables= / a form field) as wpdev's
// --tables= flag; wpdev checks the names again. undefined when there's no
// list (everything), null when it's malformed.
const TABLE_RE = /^[A-Za-z0-9_$-]{1,64}$/;
function tablesFlag(value) {
  if (value === undefined || value === '') return undefined;
  const names = String(value).split(',');
  if (names.length > 1000 || !names.every((t) => TABLE_RE.test(t))) return null;
  return `--tables=${names.join(',')}`;
}

// `wpdev db-tables`: name, rows (InnoDB's estimate), bytes -- tab-separated.
app.get('/api/sites/:name/db/tables', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['db-tables', req.params.name]);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  const tables = stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length === 3 && TABLE_RE.test(cols[0]))
    .map(([name, rows, bytes]) => ({ name, rows: Number(rows) || 0, bytes: Number(bytes) || 0 }));
  res.json({ tables });
});

// ?format=sql.gz (the default), gz or sql: the same dump, gzipped or
// plain. gz is gzipped too -- the dashboard names it like an UpdraftPlus
// database backup (backup_<date>_<site>_<hex>-db.gz).
app.get('/api/sites/:name/db/export', requireValidSiteName, async (req, res) => {
  const tables = tablesFlag(req.query.tables);
  if (tables === null) return res.status(400).json({ error: 'tables must be a comma-separated list of table names' });
  const format = req.query.format || 'sql.gz';
  if (!['sql.gz', 'gz', 'sql'].includes(format)) return res.status(400).json({ error: 'format must be sql.gz, gz or sql' });
  const outFile = path.join(PROJECT_DIR, 'backups', `${req.params.name}_api_${Date.now()}.sql.gz`);
  const args = ['db-export', req.params.name, outFile];
  if (tables) args.push(tables);
  const { code, stdout, stderr } = await runWpdev(args, DB_TIMEOUT);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  // site_20261013-1530.sql.gz: the site and when, for the browser's Downloads.
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `${req.params.name}_${stamp}.${format}`;
  // Best-effort cleanup -- this is a copy made just for this download, not
  // the authoritative backup (that's `wpdev backup`/`db-export` run by hand).
  const cleanup = () => fs.unlink(outFile, () => {});
  if (format !== 'sql') {
    res.download(outFile, name, (err) => !err && cleanup());
    return;
  }
  // Plain SQL: unzipped on the way out, never written to disk twice.
  res.attachment(name);
  res.type('application/sql');
  const gunzip = zlib.createGunzip();
  gunzip.on('error', (err) => {
    cleanup();
    res.destroy(err);
  });
  fs.createReadStream(outFile).pipe(gunzip).pipe(res);
  res.on('close', cleanup);
});

const uploadDir = path.join(PROJECT_DIR, '.api-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

app.post('/api/sites/:name/db/import', requireValidSiteName, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required (multipart field "file")' });
  const tables = tablesFlag(req.body && req.body.tables);
  if (tables === null) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'tables must be a comma-separated list of table names' });
  }
  // multer keeps no extension; db-import tells gzip from plain SQL by content.
  const args = ['db-import', req.params.name, req.file.path, '--yes'];
  if (tables) args.push(tables);
  if (req.body && ['1', 'true'].includes(String(req.body.rewriteUrls))) args.push('--rewrite-urls');
  // The name it had in the browser, for wpdev's messages instead of the
  // upload's random temp name.
  if (req.body && req.body.filename) args.push(`--label=${path.basename(String(req.body.filename)).slice(0, 200)}`);
  // ?stream=1 (the dashboard): wpdev's steps and "PROGRESS <n>" lines as
  // Server-Sent Events while it runs, then `done` with the whole output.
  if (req.query.stream === '1') {
    streamWpdev(args, res, {
      env: { WPDEV_PROGRESS: '1' },
      keepOnClose: true,
      onExit: ({ stdout, stderr }) => {
        fs.unlink(req.file.path, () => {});
        return { stdout: stdout.replace(/^PROGRESS \d+\n/gm, ''), stderr };
      },
    });
    return;
  }
  const { code, stdout, stderr } = await runWpdev(args, DB_TIMEOUT);
  fs.unlink(req.file.path, () => {});
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// ---------------------------------------------------------------------------
// Per-site database backups (`wpdev db-backup` / `db-backups`): made now, or
// on the site's schedule, into backups/<site>/.
// ---------------------------------------------------------------------------
// The suffix is auto, manual or a name of your own (a manual backup).
const BACKUP_FILE_RE = /^[a-z0-9-]+_\d{8}-\d{6}Z_([a-z0-9][a-z0-9-]{0,39})\.sql\.gz$/;
function requireBackupFile(req, res, next) {
  const { name, file } = req.params;
  if (!BACKUP_FILE_RE.test(file) || !file.startsWith(`${name}_`)) {
    return res.status(400).json({ error: `not one of ${name}'s backups: '${file}'` });
  }
  next();
}

// {schedule: {every: '6h' | null, keep}, backups: [{file, kind, label, bytes, time}]}, newest first;
// label is a manual backup's own suffix, null for plain auto/manual.
app.get('/api/sites/:name/backups', requireValidSiteName, async (req, res) => {
  const [list, schedule] = await Promise.all([
    runWpdev(['db-backups', req.params.name]),
    runWpdev(['db-backups', req.params.name, 'schedule']),
  ]);
  if (list.code !== 0 || schedule.code !== 0) {
    const failed = list.code !== 0 ? list : schedule;
    return res.status(500).json({ code: failed.code, stdout: failed.stdout, stderr: failed.stderr });
  }
  const backups = list.stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length === 4 && BACKUP_FILE_RE.test(cols[0]))
    .map(([file, kind, bytes, epoch]) => {
      const suffix = BACKUP_FILE_RE.exec(file)[1];
      const label = suffix === 'auto' || suffix === 'manual' ? null : suffix;
      return { file, kind, label, bytes: Number(bytes) || 0, time: Number(epoch) * 1000 };
    })
    .reverse();
  const every = /every=(\S+)/.exec(schedule.stdout)?.[1];
  const keep = Number(/keep=(\d+)/.exec(schedule.stdout)?.[1]) || null;
  res.json({ schedule: { every: every && every !== 'off' ? every : null, keep }, backups });
});

// Body {suffix?}: ends the file name instead of "manual" (wpdev tidies it:
// lower case, dashes); "auto" is the schedule's own.
app.post('/api/sites/:name/backups', requireValidSiteName, async (req, res) => {
  const args = ['db-backup', req.params.name];
  const suffix = req.body && typeof req.body.suffix === 'string' ? req.body.suffix.trim() : '';
  if (suffix) {
    if (suffix.length > 60) return res.status(400).json({ error: 'suffix is too long (40 characters at most)' });
    args.push(`--suffix=${suffix}`);
  }
  const { code, stdout, stderr } = await runWpdev(args, DB_TIMEOUT);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// {every: '6h' | 'off', keep: 7} -- either or both.
app.put('/api/sites/:name/backups/schedule', requireValidSiteName, async (req, res) => {
  const { every, keep } = req.body || {};
  const args = ['db-backups', req.params.name, 'schedule'];
  if (every !== undefined) {
    if (!/^(off|\d{1,4}[mhdw])$/.test(String(every))) {
      return res.status(400).json({ error: "every must be 'off' or a number and m/h/d/w, e.g. 6h" });
    }
    args.push(String(every));
  }
  if (keep !== undefined) {
    if (!/^\d{1,4}$/.test(String(keep)) || Number(keep) < 1) return res.status(400).json({ error: 'keep must be 1 or more' });
    args.push(`--keep=${keep}`);
  }
  const { code, stdout, stderr } = await runWpdev(args);
  res.status(code === 0 ? 200 : 400).json({ code, stdout, stderr });
});

app.get('/api/sites/:name/backups/:file', requireValidSiteName, requireBackupFile, (req, res) => {
  res.download(path.join(PROJECT_DIR, 'backups', req.params.name, req.params.file), req.params.file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'no such backup' });
  });
});

app.post('/api/sites/:name/backups/:file/restore', requireValidSiteName, requireBackupFile, async (req, res) => {
  const file = path.join('backups', req.params.name, req.params.file);
  const { code, stdout, stderr } = await runWpdev(
    ['db-import', req.params.name, file, '--yes', `--label=${req.params.file}`],
    DB_TIMEOUT,
  );
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

app.delete('/api/sites/:name/backups/:file', requireValidSiteName, requireBackupFile, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['db-backups', req.params.name, 'rm', req.params.file]);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// ---------------------------------------------------------------------------
// WordPress debug settings and debug.log (`wpdev debug` / `debug-log`)
// ---------------------------------------------------------------------------
const DEBUG_KEYS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG', 'SAVEQUERIES'];

// wpdev's KEY=value lines -> {settings: {WP_DEBUG: true, WP_DEBUG_LOG: '/path' ...}, log, logBytes}.
// A setting is true/false, a quoted path (WP_DEBUG_LOG), or null when unset.
function parseDebug(stdout) {
  const settings = {};
  let log = null;
  let logBytes = 0;
  for (const line of stdout.split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, raw] = m;
    if (key === 'LOG') log = raw;
    else if (key === 'LOG_BYTES') logBytes = Number(raw) || 0;
    else if (DEBUG_KEYS.includes(key)) {
      if (raw === 'true') settings[key] = true;
      else if (raw === 'false') settings[key] = false;
      else if (raw === 'unset') settings[key] = null;
      else settings[key] = raw.replace(/^'|'$/g, '');
    }
  }
  return { settings, log, logBytes };
}

app.get('/api/sites/:name/debug', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['debug', req.params.name]);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  res.json(parseDebug(stdout));
});

// {mode: 'on'|'off'} or {key, value: true|false}
app.put('/api/sites/:name/debug', requireValidSiteName, async (req, res) => {
  const { mode, key, value } = req.body || {};
  let args;
  if (mode === 'on' || mode === 'off') args = ['debug', req.params.name, mode];
  else if (DEBUG_KEYS.includes(key) && typeof value === 'boolean') args = ['debug', req.params.name, 'set', key, String(value)];
  else return res.status(400).json({ error: `send {mode: 'on'|'off'} or {key: ${DEBUG_KEYS.join('|')}, value: true|false}` });
  const { code, stdout, stderr } = await runWpdev(args);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  res.json(parseDebug(stdout));
});

// The log's last ?lines= lines (default 2000) as text.
app.get('/api/sites/:name/debug/log', requireValidSiteName, async (req, res) => {
  const lines = Math.min(Number(req.query.lines) || 2000, 20000);
  const { code, stdout, stderr } = await runWpdev(['debug-log', req.params.name, `--lines=${lines}`], { timeoutMs: 60000 });
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  res.json({ text: stdout });
});

// New lines as they're written (SSE), until the client goes away.
app.get('/api/sites/:name/debug/log/stream', requireValidSiteName, (req, res) => {
  streamWpdev(['debug-log', req.params.name, '--lines=0', '--follow'], res);
});

app.delete('/api/sites/:name/debug/log', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['debug-log', req.params.name, 'clear']);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

app.get('/api/sites/:name/debug/log/download', requireValidSiteName, async (req, res) => {
  const { code, stdout } = await runWpdev(['debug', req.params.name]);
  const { log } = parseDebug(stdout);
  if (code !== 0 || !log) return res.status(500).json({ error: "couldn't find the log" });
  res.download(path.join(PROJECT_DIR, log), `${req.params.name}-debug.log`, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'no debug.log yet' });
  });
});

// ---------------------------------------------------------------------------
// Sharing a site with other devices (`wpdev share`)
// ---------------------------------------------------------------------------
// wpdev's KEY=value lines -> {shared, domain, port, lanUrl, publicUrl, tunnel, until (ms), admin, password}.
function parseShare(text) {
  const kv = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
    if (m) kv[m[1]] = m[2].trim();
  }
  if (kv.SHARED !== '1') return { shared: false };
  return {
    shared: true,
    domain: kv.DOMAIN,
    port: Number(kv.PORT) || null,
    lanUrl: kv.LAN_URL || null,
    localUrl: kv.LOCAL_URL || null,
    publicUrl: kv.PUBLIC_URL || null,
    tunnel: kv.TUNNEL || 'off',
    until: Number(kv.UNTIL) * 1000 || null,
    admin: kv.ADMIN === '1',
    password: kv.PASSWORD || null,
  };
}

// ---------------------------------------------------------------------------
// On / off (`wpdev on|off|auto-off`)
// ---------------------------------------------------------------------------
function parsePower(text) {
  const kv = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
    if (m) kv[m[1]] = m[2].trim();
  }
  const time = (v) => (v ? Number(v) * 1000 : null);
  return {
    state: kv.STATE === 'off' ? 'off' : 'on',
    offSince: time(kv.OFF_SINCE),
    offBy: kv.OFF_BY || null,
    autoOff: kv.AUTO_OFF || 'never',
    autoOffSource: kv.SOURCE || 'default',
    idleSince: time(kv.IDLE_SINCE),
    offAt: time(kv.OFF_AT),
  };
}

app.get('/api/sites/:name/power', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['auto-off', req.params.name]);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  res.json(parsePower(stdout));
});

// {state: 'on'|'off'} switches it; {autoOff: '3d'|'never'|'default'} sets
// its auto-off. Either or both. Answers with the new state.
app.put('/api/sites/:name/power', requireValidSiteName, async (req, res) => {
  const { state, autoOff } = req.body || {};
  if (state != null && state !== 'on' && state !== 'off') {
    return res.status(400).json({ error: "state must be 'on' or 'off'" });
  }
  if (autoOff != null && !/^(\d{1,4}[mhdw]|never|default)$/.test(String(autoOff))) {
    return res.status(400).json({ error: 'autoOff must look like 30m, 12h, 3d or 1w, or be never / default' });
  }
  let stdout = '';
  let stderr = '';
  for (const args of [
    autoOff != null && ['auto-off', req.params.name, String(autoOff)],
    // Switching on may have to start a PHP container (or build its image).
    state && [state, req.params.name],
  ].filter(Boolean)) {
    const run = await runWpdev(args, { timeoutMs: 600000 });
    stdout += run.stdout;
    stderr += run.stderr;
    if (run.code !== 0) return res.status(500).json({ ...run, stdout, stderr });
  }
  const now = await runWpdev(['auto-off', req.params.name]);
  res.json({ ...parsePower(now.stdout), stdout, stderr });
});

app.get('/api/shares', async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['share']);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  // A domain line, then its indented KEY=value lines.
  const shares = [];
  for (const block of stdout.split(/\n(?=\S)/)) {
    if (block.trim()) shares.push(parseShare(block));
  }
  res.json({ shares: shares.filter((s) => s.shared) });
});

app.get('/api/sites/:name/share', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['share', req.params.name]);
  if (code !== 0) return res.status(500).json({ code, stdout, stderr });
  res.json(parseShare(stdout));
});

// {duration: '1h', public: bool, admin: bool, password: string|null} -- starts
// the share, or changes a running one (its time starts over).
app.put('/api/sites/:name/share', requireValidSiteName, async (req, res) => {
  const { duration = '1h', public: isPublic, admin, password } = req.body || {};
  if (!/^\d{1,4}[mhd]$/.test(String(duration))) return res.status(400).json({ error: 'duration must look like 30m, 2h or 1d' });
  if (password != null && password !== '' && !/^[\x20-\x7e]{4,64}$/.test(String(password))) {
    return res.status(400).json({ error: 'the password needs 4 to 64 printable characters' });
  }
  const args = ['share', req.params.name, 'on', `--for=${duration}`];
  if (isPublic) args.push('--public');
  if (admin) args.push('--admin');
  if (password) args.push(`--password=${password}`);
  // A tunnel takes a few seconds to get its address.
  const run = await runWpdev(args, { timeoutMs: 90000 });
  if (run.code !== 0) return res.status(500).json(run);
  const status = await runWpdev(['share', req.params.name]);
  res.json({ ...parseShare(status.stdout), stdout: run.stdout, stderr: run.stderr });
});

app.delete('/api/sites/:name/share', requireValidSiteName, async (req, res) => {
  const { code, stdout, stderr } = await runWpdev(['share', req.params.name, 'off']);
  res.status(code === 0 ? 200 : 500).json({ code, stdout, stderr });
});

// A QR code for ?text= (a share's address), as SVG.
app.get('/api/qr', (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 512) return res.status(400).json({ error: 'text is required (512 characters at most)' });
  const child = spawn('qrencode', ['-t', 'SVG', '-m', '1', '-l', 'M', '--svg-path', '-o', '-', text]);
  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  child.on('error', () => !res.headersSent && res.status(500).json({ error: 'qrencode is missing from the api image' }));
  child.on('close', (code) => {
    if (res.headersSent) return;
    if (code !== 0) return res.status(500).json({ error: 'qrencode failed' });
    res.type('image/svg+xml').send(Buffer.concat(chunks));
  });
});

// The minute clock: `wpdev db-backup --due` backs up whichever sites are
// due, `debug-log --rotate-due` moves any debug.log past 50 MB aside, and
// `share --expire-due` ends shares whose time is up, and `auto-off --due`
// switches off sites nobody has visited for as long as their setting says.
// Never two rounds at once -- a slow backup just delays the next.
let minuteTasksRunning = false;
setInterval(async () => {
  if (minuteTasksRunning) return;
  minuteTasksRunning = true;
  try {
    for (const [label, args] of [
      ['scheduled backups', ['db-backup', '--due']],
      ['debug.log rotation', ['debug-log', '--rotate-due']],
      ['share expiry', ['share', '--expire-due']],
      ['auto-off', ['auto-off', '--due']],
    ]) {
      const { code, stdout, stderr } = await runWpdev(args, DB_TIMEOUT);
      const out = `${stdout}${stderr}`.trim();
      if (out) console.log(`[${label}] ${code === 0 ? '' : `(exit ${code}) `}${out}`);
    }
  } finally {
    minuteTasksRunning = false;
  }
}, 60 * 1000);

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
app.get('/api/links/mailpit', sync(() => ['mailpit']));

app.listen(PORT, () => {
  console.log(`wp-local-dev API listening on :${PORT} (PROJECT_DIR=${PROJECT_DIR})`);
});
