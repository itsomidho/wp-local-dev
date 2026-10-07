# WordPress Docker Multi-Site — Local Development

A Docker-based environment for running any number of independent WordPress
sites locally — each with its own PHP version, database, SSL certificate,
and object cache — provisioned and managed through one command, `wpdev`.
It's built to behave like a real hosting stack (Nginx + PHP-FPM + MySQL +
Redis, optional full-page caching with auto-purge, a real WP-Cron loop,
outgoing-mail capture) rather than a bare WordPress container, so bugs that
only show up under production-like conditions (stale cache, cron backlogs,
wrong PHP version) show up here too, locally, before they show up somewhere
that matters. Adding a site is one interactive call, `wpdev add`, and never
touches `docker-compose.yml`.

## Features

- **Multi-site, multi-PHP** — any number of sites, each genuinely running
  its own PHP version (8.1–8.4) in its own PHP-FPM container, not just a
  label. See [Multiple PHP versions](#multiple-php-versions).
- **One-command provisioning** — `wpdev add` creates the vhost, database,
  SSL certificate, WordPress install, and default plugins in one
  interactive step. See [Getting started](#getting-started).
- **Redis object cache** — installed, activated, and enabled automatically
  on every site, with per-site cache-key prefixing so sites never collide.
  See [Redis object cache](#redis-object-cache).
- **Optional nginx FastCGI full-page cache** — opt-in per site, with
  auto-purge-on-save (via the nginx-helper plugin), per-site TTL, and
  configurable bypass cookies/paths. See
  [Full-page cache (nginx FastCGI)](#full-page-cache-nginx-fastcgi).
- **Sensible default plugins** — Hello Dolly and Akismet removed, Query
  Monitor and WP Crontrol installed and activated, on every site. See
  [Default plugins](#default-plugins).
- **Real WP-Cron** — an actual per-minute cron loop per PHP version, not
  WordPress's page-load-triggered pseudo-cron, so scheduled posts and
  queued jobs actually run on a quiet dev site. See
  [Real WP-Cron](#real-wp-cron).
- **Mail catching** — every site's outgoing mail (password resets, order
  emails, notifications) is caught by Mailpit instead of actually being
  sent, nothing to configure per site. See
  [Mail catching (Mailpit)](#mail-catching-mailpit).
- **Correct file permissions out of the box** — wp-admin plugin/theme
  installs and media uploads just work; no manual `chown`/`chmod` needed
  after creating a site. See [File permissions](#file-permissions).
- **Cloning, snapshots, and backups** — duplicate a site under a new
  domain, snapshot/restore before a risky change, full-stack or per-site
  database backup and restore. See [Cloning a site](#cloning-a-site),
  [Snapshots](#snapshots), and
  [Full-stack backup and restore](#full-stack-backup-and-restore).
- **Status and diagnostics** — `wpdev status` for a live per-site
  dashboard (HTTP, database, cache), `wpdev doctor` for problems that will
  bite you later rather than right now. See
  [Status dashboard](#status-dashboard) and [Doctor](#doctor).
- **Xdebug on demand** — installed but only attaches when triggered, so
  normal page loads stay fast. See [Xdebug](#xdebug).
- **Portainer and Adminer included** — container/image management and
  database browsing in the browser, no extra setup. See
  [Portainer](#portainer-containerimage-dashboard) and
  [Access points](#access-points).
- **Tab completion** — fish, bash, and zsh, completing subcommands, PHP
  versions, and site names. See [Tab completion](#tab-completion).
- **HTTP API** — every `wpdev` command available over HTTP (with live
  progress streaming for the slow ones), for a GUI or other tooling to
  drive this stack without a shell. See [API service](#api-service).
- **Web dashboard** — a React GUI for the API above: add/remove/clone
  sites, snapshots, caching, WP-CLI, all from the browser. See
  [Web dashboard](#web-dashboard).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (20.10+) and [Docker Compose](https://docs.docker.com/compose/install/) (2.0+)
- [mkcert](https://github.com/FiloSottile/mkcert) for trusted local SSL — install with `wpdev install-mkcert` (see below)

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/itsomidho/wp-local-dev/main/install.sh | bash
# or: wget -qO- https://raw.githubusercontent.com/itsomidho/wp-local-dev/main/install.sh | bash
```

[`install.sh`](install.sh) is worth a skim before piping it into a shell —
it's short. It clones this repo into `~/wp-local-dev` (override with
`WP_LOCAL_DEV_DIR=/some/path`), copies `.env.example` to `.env`, and
symlinks `wpdev` onto `~/.local/bin`. No `sudo`, no package installs — it
doesn't touch anything outside the clone and that one symlink. Re-running
it is safe: it detects an existing checkout and leaves `.env` alone rather
than clobbering either.

Check it worked:

```bash
wpdev help
```

### Manual install

Prefer to clone it yourself:

```bash
git clone https://github.com/itsomidho/wp-local-dev.git
cd wp-local-dev
cp .env.example .env
ln -sf "$(pwd)/wpdev" ~/.local/bin/wpdev   # so `wpdev` works from any directory
```

The symlink is just a symlink, not tracked by git, so a fresh clone on
another machine needs that last line again. If you'd rather not touch
`~/.local/bin`, every command below also works as `./wpdev <command>` from
inside this folder — no difference in behavior, just typing.

### Tab completion

All three complete subcommands (with descriptions), PHP versions for
`shell php <TAB>`, service names for `logs <TAB>`, and site names for
anything that takes one (`remove`, `clone`, `snapshot`, `restore`,
`db-export`, `db-import`, `creds`, `wp`, `db`, `adminer`) — resolved from
`nginx/sites/*.conf`, the same source `wpdev` itself treats as the
authoritative site list, not `sites/*/` (which can contain stray leftover
directories).

**fish** — autoloads from this path by filename, no reload needed:

```bash
ln -sf "$(pwd)/completions/fish/wpdev.fish" ~/.config/fish/completions/wpdev.fish
```

**bash** — source it from `~/.bashrc`, or symlink it (no `.bash` extension)
into bash-completion's user directory if you have that package:

```bash
echo 'source '"$(pwd)"'/completions/bash/wpdev.bash' >> ~/.bashrc
```

**zsh (plain)** — add its directory to `$fpath` before `compinit` runs in
`~/.zshrc`, then start a new shell:

```bash
echo 'fpath=("'"$(pwd)"'/completions/zsh" $fpath)' >> ~/.zshrc
```

**zsh (oh-my-zsh)** — symlink the directory in as a plugin (the name at
the destination is what oh-my-zsh reads, not the source directory's own
name), then add `wpdev` to your `plugins=(...)` line:

```bash
ln -sf "$(pwd)/completions/zsh" ~/.oh-my-zsh/custom/plugins/wpdev
```
```zsh
plugins=(... wpdev)
```

## Uninstalling

```bash
wpdev uninstall
```

Three separately-confirmed stages, each safe to stop after:

1. Stops and removes containers, volumes, and the `wp-local-dev-php8x`
   images built from this repo (`docker compose down -v --rmi local`) —
   asks `yes`/`no` first, since this deletes every site's database.
2. Removes the `wpdev` symlink from `~/.local/bin` or `/usr/local/bin` —
   only if it actually points at this checkout, so it never touches a
   symlink belonging to some other project.
3. Optionally deletes this entire directory — every site's files, logs,
   snapshots, and backups. Requires typing `DELETE`, not just `yes`, since
   unlike the first two steps there's no undo. Decline and the directory
   is just left in place for you to remove manually later.

## Updating

```bash
wpdev update
```

`git pull --ff-only`, then `docker compose build && docker compose up -d
--force-recreate`. A few deliberate choices:

- Refuses to run at all if you have uncommitted local changes — commit or
  stash first.
- Fast-forward only, never an auto-merge: if your branch has local commits
  origin doesn't have, it fails loudly and tells you to rebase rather than
  guessing what you want.
- Always rebuilds and force-recreates every container, even for a change
  that looks docs-only. A plain `docker compose up -d` only restarts a
  container whose *compose service config* changed — it has no way to
  notice a bind-mounted file's *content* changed (`nginx.conf`,
  `php/xdebug.ini`, etc.), so a pulled fix could otherwise sit on disk
  unapplied until something else happened to restart that container.
  Site data isn't touched either way — only the stack's own containers.
- Works the same from the dashboard's "Update available" badge, including
  for the api service itself, which can't rebuild and recreate its own
  container mid-request. See [API service](#api-service).

## Getting started

```bash
wpdev install-mkcert     # 1. one-time: sets up a local trusted SSL CA
wpdev up                 # 2. start mysql, php81-84, redis, mailpit, nginx, adminer, portainer, api, dashboard
wpdev add                 # 3. provision your first site
```

`wpdev add` is interactive — it walks you through it:

```
$ wpdev add
Enter domain name (e.g., mysite.test): mysite.test

PHP version [8.2] (choices: 8.1 8.2 8.3 8.4): 8.3
WordPress version [latest]: 6.4.3

Domain:          mysite.test
Site directory:  sites/mysite
Database:        wp_mysite
PHP version:     8.3 (php83)
WordPress:       6.4.3

Continue? (y/n): y
[STEP] 1/9 Starting MySQL + php83 + Redis...
...
✓ mysite.test is ready

  Site:        https://mysite.test
  PHP version: 8.3 (php83)
  Admin login: https://mysite.test/wp-admin  (admin / <generated password>)

Add '127.0.0.1 mysite.test' to /etc/hosts now? (y/n): y
```

Press enter at either prompt to take the default (8.2, latest WordPress). That
one command:

1. Creates the Nginx vhost in `nginx/sites/<domain>.conf`, pointed at the chosen PHP version
2. Downloads the requested WordPress version (`wp core download`, latest if
   left blank) into `sites/<name>/`, and saves the PHP version choice to
   `sites/<name>/.php-version`
3. Creates a dedicated MySQL database + user for the site
4. Generates `wp-config.php` via WP-CLI (Redis + `DISABLE_WP_CRON` included — see below)
5. Generates an mkcert SSL certificate
6. Runs `wp core install` — **no browser installer, no Adminer step**
7. Installs + activates the `redis-cache` plugin and enables the object cache
8. Removes Hello Dolly + Akismet, installs + activates Query Monitor and WP Crontrol
9. Normalizes file permissions so wp-admin can install plugins/themes and uploads (see below)
10. Reloads Nginx and offers to add the `/etc/hosts` entry for you

Visit `https://mysite.test` — it's a working, logged-in-capable WordPress
site with Redis object caching already on. The admin password is also saved
to `sites/mysite/.admin-password` if you need it again later (or just run
`wpdev creds mysite`).

Run `wpdev add` again for each additional site — the containers don't
restart, and every site gets its own vhost, cert, and database.

Unlike PHP, there's no fixed list of WordPress versions to pick from — any
real release string (`6.4.3`, `6.0`, ...) is passed straight through to
`wp core download --version=`, which is also what resolves a blank answer
to the actual latest release. A typo or nonexistent version fails loudly
with wp-cli's own error rather than silently falling back to latest.

## Command reference

Everything is `wpdev <command> [argument]`:

| Command | What it does |
|---|---|
| `wpdev up` | Start all containers |
| `wpdev down` | Stop all containers |
| `wpdev restart` | Restart all containers |
| `wpdev update` | `git pull` (fast-forward only), then rebuild + recreate every container |
| `wpdev update-check` | Fetch and report whether an update is available — no changes made |
| `wpdev status` | Container status, plus a per-site table: PHP/WordPress/MySQL versions, reachable? DB connected? Redis cache connected? |
| `wpdev doctor` | Proactive health check — CA trust, orphan containers, per-site DB sanity (see below) |
| `wpdev fix-dns` | Repair container DNS when the host's resolver lives behind a VPN tunnel (needs sudo). `wpdev up` already does this for you — this is for running it on its own |
| `wpdev logs [service]` | Tail logs — all services, or one (`php`, `nginx`, `mysql`, `redis`) |
| `wpdev shell php [ver]\|db\|nginx\|redis` | Shell into a container — `php` defaults to 8.2, or specify e.g. `php 8.4` (as you, not root) |
| `wpdev db [name]` | Open a MySQL prompt (CLI) — root by default, or scoped straight into one site's own DB |
| `wpdev adminer [name]` | Open Adminer in the browser — root by default, or deep-linked to one site's DB |
| `wpdev portainer` | Open Portainer in the browser (Docker container/image management) |
| `wpdev mailpit` | Open Mailpit in the browser — every site's outgoing mail, caught |
| `wpdev dashboard` | Open the web dashboard in the browser (GUI for everything above) |
| `wpdev reload-nginx` | Test + reload Nginx (after editing a vhost by hand) |
| `wpdev cache <site> on\|off` | Toggle nginx full-page cache for a site |
| `wpdev cache-purge` | Clear the full-page cache (shared across every site that has it enabled) |
| `wpdev backup` | `mysqldump --all-databases` to `backups/` |
| `wpdev restore-all [file] [--yes]` | Replace every database from a backup (defaults to the latest in `backups/`) |
| `wpdev install-mkcert` | One-time local CA setup for trusted SSL |
| `wpdev clean` | Remove containers (keeps data) |
| `wpdev clean-all [--yes]` | Remove containers **and volumes** (⚠ deletes all data, asks to confirm) |
| `wpdev uninstall` | Remove containers/volumes/images + the `wpdev` symlink, then optionally this whole directory (see below) |
| `wpdev add` | Provision a new site (interactive — prompts for domain + PHP + WordPress version). Non-interactive: `wpdev add --domain=<domain> [--php=<version>] [--wp-version=<version>]` |
| `wpdev remove <name> [--yes]` | Delete a site: WP files, DB, Nginx config, SSL cert, logs (asks you to confirm) |
| `wpdev clone <src> <new> [--yes]` | Duplicate a site (files + DB) under a new domain, with URLs re-pointed and its own DB/cache |
| `wpdev snapshot <site> [label]` | Save a files+DB snapshot of a site |
| `wpdev snapshots <site>` | List saved snapshots for a site |
| `wpdev restore <site> [snap-id] [--yes]` | Restore a site from a snapshot (asks you to confirm; defaults to the latest) |
| `wpdev db-export <site> [file]` | Dump just that site's database (default: `backups/<site>_<time>.sql.gz`) |
| `wpdev db-import <site> <file> [--yes]` | Replace that site's database from a `.sql` or `.sql.gz` dump (asks you to confirm) |
| `wpdev list` | List configured site domains |
| `wpdev hosts` | Print the `/etc/hosts` lines needed for all sites |
| `wpdev creds <name>` | Show a site's admin/DB credentials |
| `wpdev cert <name>` | Reissue a site's HTTPS certificate from the current mkcert CA, then reload nginx |
| `wpdev fix-perms <name>\|--all` | Give a site's files back to you (owner + write), e.g. after copying a site in from elsewhere |
| `wpdev wp <name> <args...>` | Run any WP-CLI command against a site, e.g. `wpdev wp mysite plugin list` |

Answering "no" to any confirmation prompt prints `Cancelled.` and exits
with status 1, not 0, so a script can tell a declined command from one
that actually ran.

`wpdev help` prints this same list from the terminal. There's nothing else to
learn — it's a thin wrapper around `docker compose` (stack lifecycle) and
WP-CLI (site provisioning), nothing hidden behind it.

## Access points

| Service | URL | Credentials |
|---|---|---|
| Your sites | `https://<domain>` (or `https://<domain>:<NGINX_HTTPS_PORT>`) | `wpdev creds <name>` |
| Adminer | `http://localhost:39002` (`ADMINER_PORT`) | `root` / `DB_ROOT_PASSWORD` in `.env` |
| MySQL (host) | `localhost:39000` (`MYSQL_PORT`) | `root` / `DB_ROOT_PASSWORD` in `.env` |
| Redis (host) | `localhost:39001` (`REDIS_PORT`) | none (no auth configured — local dev only) |
| Portainer | `http://localhost:39003` (`PORTAINER_PORT`) | Set your own admin account on first visit (see below) |
| Mailpit | `http://localhost:39004` (`MAILPIT_UI_PORT`) | none — local only, nothing ever really sends |
| API | `http://localhost:39006` (`API_PORT`) | none by default — set `API_TOKEN` in `.env` (see [API service](#api-service)) |
| Dashboard | `http://localhost:39007` (`DASHBOARD_PORT`) | none — API token (if set) entered in its own settings panel |

Every port above except nginx's 80/443 lives in one deliberately-uncommon
block (39000–39007, see `.env.example`) specifically to avoid colliding with
another locally-installed MySQL/Redis or some other tool's web UI on 8080/
9000 — the single most common reason a `docker compose up` fails on a dev
machine that already has other things running. Change any one of them in
`.env` if it ever does collide with something else.

nginx's own ports can move too (`NGINX_HTTP_PORT`/`NGINX_HTTPS_PORT`), if
something else on this machine already owns 80/443. Sites then live at
`https://<domain>:<port>`, and everything follows that: the URL `add`
writes into `WP_HOME`/`WP_SITEURL` and installs WordPress with, `clone`'s
URL rewrite, `status`'s reachability check, `list`, and the dashboard's
links. That URL is fixed when a site is created, though. Change the port
afterwards and existing sites keep redirecting to the old one until you
update their `WP_HOME`/`WP_SITEURL` in `wp-config.php` (plus a `wpdev wp
<site> search-replace` of the old URL for content). Switching back to
80/443 is simplest when nothing else needs those ports.

## Status dashboard

```bash
wpdev status
```

Shows container health (`docker compose ps`) plus a per-site table — the
WordPress-specific view Portainer's generic container UI can't give you:

```
DOMAIN                       PHP    WP        MYSQL     HTTP   DATABASE   CACHE
mysite.test                  8.2    6.9.1     8.0.44    200    OK         Connected
otherlab.test                8.3    6.7.2     8.0.44    200    OK         off
```

- **PHP**/**WP** — the site's PHP version (`sites/<name>/.php-version`) and
  its real WordPress core version (`wp core version`) — different sites can
  genuinely be on different versions of each
- **MYSQL** — the one shared server's version; the same on every row, since
  there's only one `mysql` container for the whole stack
- **HTTP** — the site's actual response code, checked directly against
  `127.0.0.1` (works even before you've added the `/etc/hosts` entry, and
  ignores any proxy your shell has set)
- **DATABASE** — `OK`/`FAIL`/`down`, checked against that site's real
  `DB_NAME` from its own `wp-config.php`
- **CACHE** — `Connected`/`off`/`n/a` — `off` just means that site predates
  the Redis feature (`wpdev add` enables it automatically; older sites never
  got it retrofitted)

## Doctor

```bash
wpdev doctor
```

`status` tells you what's happening right now; `doctor` looks for things
that will bite you *later* — read-only, diagnose-only, never fixes anything
for you, just tells you the command to run:

- Docker daemon reachable, `.env` present and populated
- Every expected container actually running (not just present)
- Orphaned `wp-*` containers left over from a renamed/removed service
- Containers left behind by an interrupted recreate. Compose temporarily
  renames a container it's replacing to `<id>_wp-<service>`, and if the
  process doing that dies mid-way, the never-started replacement stays
  behind. `wpdev up` removes those itself.
- mkcert's local CA actually exists (not just that `mkcert` is installed)
- A stray `docker/` directory at the repo root, if present
- Two host-level problems that masquerade as a broken stack — a dead Docker
  credential helper, and a VPN resolver containers can't reach. `wpdev up`
  repairs both by itself; `doctor` just reports them (see "Host environment")
- Disk usage of `sites/`
- Every running php container runs PHP as you (see [File permissions](#file-permissions))
- Per site: every file owned by you and writable (if not, `wpdev fix-perms
  <site>`), `/etc/hosts` entry present, SSL cert present and still good
  (not expired or expiring within 30 days, and issued by the mkcert CA
  your browser trusts; if not, run `wpdev cert <site>`), and — the one
  this was built for — **whether the database `wp-config.php` actually
  points at really exists**, distinct from existing-but-empty. This is
  exactly the check that would have caught the incident that led to this
  command existing: a site's `wp-config.php` silently pointing at a
  database that isn't there.

## Multiple PHP versions

Each site genuinely runs its own PHP — not a label, an actual separate
PHP-FPM container per version. `wpdev add` prompts for one:

```
PHP version [8.2] (choices: 8.1 8.2 8.3 8.4): 8.4
```

Press enter for the default (8.2). The choice is saved to
`sites/<name>/.php-version` and baked into that site's Nginx vhost
(`fastcgi_pass php84:9000`, etc.) — `docker-compose.yml` runs one service
per version (`php81`/`php82`/`php83`/`php84`), all sharing the same `sites/`
directory; which container actually handles a given site is entirely down
to which one its vhost points at.

```bash
wpdev shell php 8.4          # shell into a specific version's container
wpdev list                   # shows each site's PHP version
wpdev status                 # ditto, in the per-site table
```

`wpdev clone` carries the source site's PHP version over to the clone
automatically — it's not re-prompted.

**Cron runs per-version too, correctly.** Each PHP container runs its own
cron daemon (see "Real WP-Cron" below), and each one only processes sites
assigned to *its own* version — not every site on the shared filesystem.
This isn't just tidiness: running a site's scheduled events under the wrong
PHP interpreter can outright fatal-error on version-specific syntax, which
is exactly what happened to a real site here while this was being built,
before the partitioning logic was fixed. Each container reads its own
version from `/etc/php-version` (written once at container start) — not an
environment variable, because cron jobs run with a stripped environment
that never sees Docker's `ENV`, and php-fpm's own master process clears its
internal environment too, so there's genuinely no env var left to read by
the time a cron job runs.

**Nginx re-resolves PHP upstreams dynamically — no manual reload needed.**
Site configs use `resolver 127.0.0.11 valid=10s ipv6=off;` (Docker's
embedded DNS) plus `set $upstream_php ...; fastcgi_pass $upstream_php:9000;`
instead of a bare `fastcgi_pass phpXX:9000;`. A bare hostname is resolved
once, at worker startup, and cached for the worker's whole life — so
restarting any `php8x` container (which gets a new IP) caused real,
intermittent 500s until nginx was reloaded, found the hard way after a
routine container restart broke a live site mid-session. The `set`
+ `resolver` combo forces a fresh lookup on every request instead.

## Cloning a site

```bash
wpdev clone mysite mysite-test
```

Duplicates `mysite`'s files and database under a new domain
(`mysite-test.test`), then:

- Creates a fresh, dedicated database + user for the clone (never reuses or
  shares the source's database)
- Rewrites `wp-config.php` for the new DB and domain
- Runs `wp search-replace` against the copied database so `siteurl`/`home`
  and any URLs embedded in post content actually point at the new domain,
  not the old one
- Sets its own `WP_REDIS_PREFIX` so the clone's cache never collides with
  the source's, and enables the object cache
- Re-points any symlink that pointed into the source site so it points into
  the clone instead. Query Monitor's `wp-content/db.php` drop-in is an
  absolute symlink, and a clone that kept it ran the source's copy of the
  plugin and failed with a 500 on every page.

The admin login is whatever the source site's was — it's a copy of that
same database, not a new account. `wpdev creds mysite` still works to look
it up. The source site is never touched; only files are read from it.

Refuses to run if the destination name already exists — remove it first
(`wpdev remove`) or pick a different name, rather than silently overwriting
something that might matter.

Asks "Continue? (y/n)" before doing anything — skip with `--yes` for
scripted use. With `--yes` it also skips the trailing "add to /etc/hosts?"
question and just prints the line to add, the same as `add --domain=…`
does, so nothing waits on input that may never come.

## Snapshots

```bash
wpdev snapshot mysite before-risky-plugin-update   # label is optional
wpdev snapshots mysite                             # list what's saved
wpdev restore mysite                               # defaults to the latest snapshot
wpdev restore mysite 20260115_143022_before-risky-plugin-update
```

Take a snapshot before doing anything you might want to undo — updating a
plugin, testing a theme change, whatever. Each snapshot is a full files +
database backup, stored under `snapshots/<site>/<timestamp>[_label]/`
(git-ignored — these live on disk only, never committed).

`restore` overwrites the site's *current* files and database with the
snapshot's, and flushes that site's Redis cache afterward so you don't end
up looking at stale cached content from before the rollback. It asks you to
type the domain to confirm first (skip with `--yes` for scripted use) — the
current state is not auto-saved before restoring, so if you want to keep it,
take a snapshot of it first.

Snapshots are never deleted automatically — not by `restore`, and not by
`wpdev remove` on the site they belong to (a safety net shouldn't quietly
disappear as a side effect of something else). Clean up `snapshots/<site>/`
by hand when you no longer need them.

## Full-stack backup and restore

```bash
wpdev backup                       # -> backups/all_databases_<timestamp>.sql
wpdev restore-all                  # restores the latest backup in backups/
wpdev restore-all path/to/file.sql # or a specific one (.sql or .sql.gz)
```

`wpdev backup` used to be one-directional — the only way to actually use a
dump was hand-crafting a `mysql < dump.sql` yourself. `restore-all` replaces
*every* database currently in MySQL with the backup's contents, so it asks
you to type `RESTORE` (not just `y`/`yes`) before doing anything — skip with
`--yes` for scripted use — and doesn't back up the current state first — run
`wpdev backup` right before it if you want to keep what's there now.

## Sharing a site's database

`wpdev backup` dumps every database at once — useful for a full-stack backup,
not for handing one site's data to someone else. For that:

```bash
wpdev db-export mysite                       # -> backups/mysite_<timestamp>.sql.gz
wpdev db-export mysite mysite-for-bob.sql.gz # or a specific path

wpdev db-import mysite that-file.sql.gz      # .sql or .sql.gz, auto-detected
```

`db-import` **replaces** the site's entire current database (asks you to
confirm — skip with `--yes` for scripted use) and flushes its Redis cache afterward. If the dump came from a
different domain, `wpdev` doesn't guess at re-pointing URLs for you — it
prints the exact `wp search-replace` command to run, since only you know
what the old domain actually was.

## Xdebug

Xdebug is installed but only attaches on demand
(`xdebug.start_with_request=trigger` in `php/xdebug.ini`), so normal page
loads aren't slowed down. Trigger it per-request with the "Xdebug helper"
browser extension, or `?XDEBUG_TRIGGER=1`. VS Code config is in
`.vscode/launch.json` ("Listen for Xdebug (wp-local-dev)"), listening on 9003.

## Redis object cache

Every site provisioned by `wpdev add` gets the [redis-cache](https://wordpress.org/plugins/redis-cache/)
plugin, installed, activated, and enabled against the shared `redis`
container automatically — no per-site setup needed. Since Redis is shared
across all sites, each site's `wp-config.php` sets its own
`WP_REDIS_PREFIX` (its site name) so cache keys never collide between sites.

```bash
wpdev wp mysite redis status     # connection status, drop-in, hit/miss info
wpdev shell redis                # raw redis-cli, e.g. KEYS mysite:*
```

Redis has no volume — it's purely a cache, so a restart just means the next
few page loads repopulate it. `wpdev remove` flushes a site's own keys.

## Default plugins

Every site provisioned by `wpdev add` has its plugin list adjusted once,
at creation time — this doesn't run again on an existing site:

- **Removed**: Hello Dolly and Akismet, WordPress's own stock defaults.
  Nobody uses either on a local dev box, so they're just clutter in the
  plugins list.
- **Installed + activated**: [Query Monitor](https://wordpress.org/plugins/query-monitor/)
  (queries, hooks, template parts, HTTP API calls, PHP errors — the
  standard WP debugging plugin) and
  [WP Crontrol](https://wordpress.org/plugins/wp-crontrol/) (view, run, and
  debug scheduled cron events from wp-admin — the natural companion to
  this project's real WP-Cron setup, see below).

Neither depends on Redis or the full-page cache — they're just a better
default for every site regardless of what else is turned on.

**None of `wpdev`'s core functionality depends on any of these plugins
actually installing** — including Redis's own `redis-cache` plugin.
Every plugin install in `wpdev add` is best-effort: if one fails (no
network reaching wordpress.org, wordpress.org itself being down, a
transient error), it prints a warning and the site still finishes
provisioning and becomes reachable, just without that one plugin. Found
and fixed live by forcing a real network failure during provisioning —
every plugin install here used to be able to take the *entire site*
down with it if it failed, which defeats the point of a plugin being
optional.

## File permissions

Every file in `sites/` is owned by **you**, whoever writes it. That includes
WordPress updating a plugin from wp-admin, a media upload, `wpdev wp …`,
WP-Cron, a `wpdev clone`, or a snapshot restore. So your editor can change
anything WordPress wrote, and WordPress can change anything you wrote, with
no sudo, no shared group, and no `chmod` dance.

How: every process that writes site files runs as your own uid/gid.

- **PHP-FPM, wp-cli and cron** all run as `www-data` inside the php
  containers. At startup, `php/entrypoint.sh` renumbers `www-data` to your
  uid/gid (`API_UID`/`API_GID` in `.env`, which `wpdev up` detects from
  `id -u`/`id -g`). `wpdev` runs wp-cli as `www-data` rather than as root,
  and the crontab runs its job as `www-data` too.
- **nginx's worker processes** are renumbered the same way
  (`nginx/host-user.sh`). They share the full-page cache with PHP, and
  nginx-helper purges a page on save by deleting nginx's cache file for it.
  That only works when both run as the same user.
- **`wpdev shell php`** opens a shell as `www-data` too, so a `composer
  install` run in there produces files you own. For root, use `docker exec
  -it wp-phpXX sh`.

Before this, wp-cli wrote as **root** and PHP-FPM as **uid 33**. Each
side's files were read-only to the other and to you, which produced
`Could not create directory` and `Could not create the upgrade-temp-backup
directory` errors in wp-admin, and permission errors in your editor.

### Sites created before this, or copied in from elsewhere

Files from an older version of this project, or from another machine or
local tool, can be owned by root, by uid 33, or by another user, or can lack
the owner write bit. `wpdev doctor` checks every site and tells you when:

```
⚠   1000+ path(s) under sites/mysite aren't owned by you or aren't writable — … Run: wpdev fix-perms mysite
```

```bash
wpdev fix-perms mysite    # one site
wpdev fix-perms --all     # every site
```

This `chown`s the site to you and makes everything owner-writable. It
doesn't follow symlinks, and it doesn't touch the mode bits of files you
already own. The dashboard has the same thing as a **Fix file permissions**
button in each site's Overview tab. `add`, `clone` and `restore` all finish
by doing this for the site they just wrote, so a site that came out of any
of them never needs it.

`wpdev doctor` also warns if a php container is still running PHP as a
different user than you (one started from an older checkout). `wpdev up`
recreates it.

## Full-page cache (nginx FastCGI)

Off by default — Redis above only caches WordPress's own objects/queries;
this caches entire rendered HTML pages at the nginx level, the same way a
production box fronted by something like WordOps often does. Useful for
catching cache-interaction bugs locally (stale content after an edit,
logged-in users seeing an anonymous-cached page, broken cache-busting on a
form submit) before they show up somewhere that actually matters.

```bash
wpdev cache mysite on     # regenerates mysite's nginx vhost with caching added
wpdev cache mysite off    # regenerates it back to plain (no caching)
wpdev cache-purge         # clears the cache -- shared across every site
                           # that has it enabled, not per-site
```

Bypassed automatically for logged-in users, commenters, password-protected
posts, `POST` requests, anything with a query string, and `/wp-admin/`,
`wp-login.php`, `wp-cron.php`, `xmlrpc.php` — the standard WordPress FastCGI
cache recipe. Check what actually happened on any request:

```bash
curl -skI https://mysite.test/ | grep -i x-fastcgi-cache
# MISS the first request, HIT after, BYPASS whenever the rules above apply
```

### Auto-purge on save ([nginx-helper](https://wordpress.org/plugins/nginx-helper/))

`wpdev cache <site> on` also installs and configures the nginx-helper
plugin, so saving a post actually invalidates that stale cache instead of
leaving it to expire on its own after the TTL. It's configured to use
nginx-helper's "unlink files" purge method — deleting the exact cache
file directly from disk — rather than its default (an HTTP request back
to nginx), because that default needs a commercial/third-party nginx
module (`ngx_cache_purge`) this project's stock `nginx:alpine` image
doesn't have. "Unlink files" needs real filesystem access to the same
cache nginx wrote to, which is why the `wp_fastcgi_cache` volume in
`docker-compose.yml` is shared between the `nginx` and every `phpXX`
service, not kept container-local.

Turning cache `off` deactivates the plugin again (it has nothing to
purge without caching on); the 30+ other plugin settings (purge rules,
Redis options for an unrelated caching mode the plugin also supports,
etc.) are set once from the plugin's own documented defaults, not
guessed — verified directly against its source.

**The core caching feature doesn't depend on this plugin.** Installing
it needs the internet (downloading from wordpress.org); the actual
FastCGI cache — MISS/HIT/BYPASS, TTL, every bypass rule above — is pure
nginx config with zero WordPress involvement. If the plugin install
fails for any reason, `wpdev cache <site> on` still enables real caching
and just prints a warning instead of aborting — confirmed by forcing the
install to fail on purpose. You'd only lose auto-purge-on-save, and can
still clear things manually with `wpdev cache-purge` or just wait out
the TTL. Re-running `wpdev cache <site> on` retries the plugin setup.

A config change (or a stale page from before you last purged) can still
show up as a `HIT` until you `wpdev cache-purge` — the cache stores the
whole response including headers, so toggling or editing doesn't
retroactively fix what's already sitting in it.

### Per-site TTL, extra bypass cookies, and extra bypass paths

Three optional files, read when you run `wpdev cache <site> on`:

```
sites/mysite/.cache-ttl               # a plain duration, e.g. 5m or 1h -- defaults to 60m
sites/mysite/.cache-bypass-cookies    # one cookie name per line, added to the baseline rules above
sites/mysite/.cache-bypass-paths      # one URL path per line, added to the baseline rules above
```

Both bypass files take plain names, never nginx regex — a trailing `*`
means "starts with" (for a cookie with a dynamic suffix, or a path whose
sub-pages should all bypass too), anything else must match exactly:

```
# .cache-bypass-cookies
woocommerce_items_in_cart
wp_woocommerce_session_*

# .cache-bypass-paths
/cart/
/checkout/*
```

The two files aren't matched the same way under the hood, deliberately.
Cookies use a loose substring match, same as the baseline WordPress rules
already did — a cookie name colliding by coincidence with another
cookie's name or value is rare enough not to matter. Paths are anchored
(`^pattern$` for an exact path, `^pattern` for a prefix) because URL
hierarchies routinely share prefixes for real — a loose substring match on
`/cart/` would also incorrectly bypass `/shop/cart/`.

`wpdev cache` validates every line against a strict whitelist and escapes
it itself before it reaches nginx, so a typo fails here with a clear
message instead of silently breaking the generated config or (worse)
being interpreted as nginx syntax. A bare `*` or a leading `*` (e.g.
`*_session`, `*/checkout/`) is rejected either way — the contract is
prefix-only, and only at the end.

## Mail catching (Mailpit)

Every site's outgoing mail — password resets, WooCommerce order emails,
contact form notifications, comment alerts, anything sent via `wp_mail()` —
is caught by [Mailpit](https://mailpit.axllent.org/) instead of actually
being delivered. Nothing to configure per site: PHP's `mail()` (what
`wp_mail()` uses by default) is relayed to Mailpit at the PHP-container
level via `msmtp` (`php/msmtprc` + `php/mail.ini`), so it works
automatically for every site — including ones that predate this feature.

```bash
wpdev mailpit
```

Opens the web inbox at `http://localhost:39004`. Real SMTP too, at
`localhost:39005`, if some tool wants to connect directly instead of going
through `mail()`.

## Real WP-Cron

WordPress's default "cron" isn't a real scheduler — it only checks for due
events on a page load, so scheduled posts, WooCommerce order processing,
and plugin maintenance tasks can silently sit unrun on a quiet local site
with little traffic. Every site `wpdev add` creates gets
`DISABLE_WP_CRON` set automatically, and each PHP container (php81–php84)
runs its own cron daemon that processes the actual due events for every
site assigned to *its* version (see "Multiple PHP versions" above), once a
minute, regardless of whether anyone loads a page:

```bash
tail -f logs/cron.log             # watch it run
wpdev wp mysite cron event run --due-now   # trigger a site's cron manually, right now
```

This is genuinely necessary, not theoretical — building this surfaced a
real backlog of dozens of unrun events (Yoast SEO, Gravity Forms, Elementor,
All-in-One WP Migration) on the sites in this repo that had been silently
queued for who knows how long under the old page-load-triggered pseudo-cron.

A few things worth knowing if you ever touch `php/crontab` or
`php/wp-cron-runner.sh`:

- The crontab file (and `entrypoint.sh`, which writes `/etc/php-version` at
  startup) are **baked into the image**, not bind-mounted like the other
  `php/*` configs — Debian's `cron` silently ignores `/etc/cron.d` files
  that aren't root-owned and non-group-writable, which a bind mount can't
  guarantee (it inherits the host file's ownership). Changing either needs
  `docker compose build php81 php82 php83 php84`, not just an edit.
- `wp-cron-runner.sh` **is** bind-mounted and does pick up edits live in
  principle, but some editors/tools replace-rather-than-modify a file on
  save, which can orphan an already-open bind mount — if a change doesn't
  seem to take effect, `docker compose restart php81 php82 php83 php84`
  forces a fresh mount.
- The runner is `flock`-guarded against overlapping itself — a slow event
  (a big first-run backlog, or just a slow plugin hook) can take longer
  than cron's one-minute interval, and without the lock, overlapping runs
  pile up.

## Portainer (container/image dashboard)

```bash
wpdev portainer
```

Opens a web UI showing every container's state, logs, resource usage, plus
images, volumes, and networks — for this project and anything else on your
Docker daemon.

**First visit:** it asks for a one-time setup token instead of a bare login
screen — get it with `docker logs wp-portainer`, paste it in, then create
your own admin account.

**Worth knowing:** Portainer works by mounting your host's `docker.sock`,
which gives it — and anyone who can reach `localhost:39003` — full control of
your *entire* Docker daemon, not just this project's four containers. That's
inherent to how Portainer works, not a misconfiguration. Fine for a personal
dev machine; worth remembering if this box is ever shared or exposed.

## API service

A thin HTTP API wrapping `wpdev` — no reimplemented logic. Every endpoint
either runs a `wpdev` subcommand and returns its output as JSON, or (for
anything slow and step-by-step: `add`, `clone`, `snapshot`, `restore`,
`update`, `backup`, `restore-all`) streams its output live as
Server-Sent Events. It exists so a GUI or other automation can drive this
stack without shelling out itself. Starts automatically with `wpdev up`,
same as every other service, at `http://127.0.0.1:39006` by default
(`API_PORT` in `.env`).

```bash
curl http://127.0.0.1:39006/api/status
curl http://127.0.0.1:39006/api/sites
curl -X POST http://127.0.0.1:39006/api/sites \
  -H 'Content-Type: application/json' \
  -d '{"domain": "mysite.test", "php": "8.2"}'
```

Endpoints cover the stack (`status`, `doctor`, `up`/`down`/`restart`,
`logs`), sites (`add`/`remove`/`clone`, `creds`, a generic WP-CLI
passthrough, `cache`), snapshots/restore, database import/export, and
`backup`/`restore-all`. A few just return a URL + login hint rather than
duplicating wpdev's own credential-lookup logic (`/api/links/adminer`,
`/api/links/portainer`, `/api/links/mailpit`) — open it yourself, since
this container has no browser to open it for you.

**Worth knowing:**

- **Bound to `127.0.0.1` only**, regardless of `API_PORT` — this service can
  delete sites and drop databases on a bare HTTP call. Set `API_TOKEN` in
  `.env` to also require `Authorization: Bearer <token>`; without it, any
  other local user/process on this machine can reach it.
- **Docker-outside-of-Docker.** This container has no Docker daemon of its
  own — it talks to the host's daemon over a bind-mounted socket (same as
  Portainer) and runs real `wpdev`/`docker compose` commands against it. It
  runs as your own user (`API_UID`/`API_GID`, auto-detected by `wpdev up`
  from `id -u`/`id -g`), not root, so files it writes directly — snapshots,
  nginx configs, SSL certificates, backups — land owned by you, same as if
  you'd run `wpdev` from the CLI yourself.
- **Certificates:** site creation through the API generates a real cert via
  mkcert, from your host's own mkcert CA, so it's browser-trusted the same
  as a site created from the CLI. `wpdev up` fills `MKCERT_CAROOT` in `.env`
  with your host's `mkcert -CAROOT` when it's empty, and mounts that CA into
  the api container. It never overrides a value you've set. Without mkcert
  on the host, the api falls back to a container-local CA of its own
  (valid, but browsers show a certificate warning). A site created that way
  can be fixed later with `wpdev cert <site>` once the CA is shared.
- **`status` checks reachability the same way from here as from the host.**
  Inside the api container, `127.0.0.1` is the container itself, not
  nginx, so the check connects to nginx over the compose network instead,
  while still sending the site's real hostname. A site shows the same code
  in the dashboard as in a terminal. `doctor`'s `/etc/hosts` check is
  accurate too (the host's `/etc/hosts` is bind-mounted in read-only).
- **The api never stops or recreates itself mid-request.** `up`, `down`,
  `restart` and `update` sent through the API (the dashboard's
  Up/Down/Restart/Update buttons) run inside `wp-api`, and stopping or
  recreating `wp-api` from there would kill the very process doing the
  work, halfway through. So from in there they act on every service
  *except* `api`. If they can't read the service list, they refuse to run
  rather than fall back to "every service". When the api itself needs
  recreating, they hand just that step to a short-lived helper container,
  `wpdev-api-updater`: after `up` if its config changed (e.g. `.env` after
  a `git pull`), and always after `update`, which also rebuilds its image.
  The helper runs as you, survives the recreate, and removes itself. The
  dashboard shows "unreachable" for a few seconds and then reconnects on
  its own. The helper's output goes to `logs/api-updater.log`. `down` and
  `restart` still leave the api alone, so the dashboard stays usable to
  bring the stack back.
- **`PROJECT_DIR`, `API_UID`, `API_GID`, and `DOCKER_GID`** in `.env` are
  auto-managed by `wpdev up` — real facts about this machine (this
  directory's path, your uid/gid, the Docker socket's gid), re-detected on
  every run. Don't hand-edit them or copy them from another machine.

## Web dashboard

```bash
wpdev dashboard
```

A React GUI (`dashboard/`) for everything above — add/remove/clone sites,
manage snapshots, toggle caching, run WP-CLI commands, and watch
long-running actions stream live, all from the browser instead of the CLI.
Starts automatically with `wpdev up`, at `http://localhost:39007` by default
(`DASHBOARD_PORT` in `.env`).

It's a thin client, same principle as the API: it's static files (no server
logic of its own) that talk directly to the `api` service from your
browser, rendering `wpdev`'s own colored output rather than re-deriving
status text. `doctor`/`status` show up exactly as they would in a terminal,
and every provisioning/removal action shows the real, live `wpdev` output as
it happens.

Each site's row shows its real WordPress core version alongside its PHP
version (both genuinely vary per site), and the shared MySQL version once
near the "+ Add site" button rather than repeated on every row, since
every site uses the same one server. This comes from `status`, not
`list` — getting it means a real `wp core version` per site, so unlike
the sites list itself (which polls every 15s) it's only refreshed on
load, after an action that changes the site list, or an explicit click
on the refresh icon.

A "Machine" panel at the top shows the host's CPU, memory, and disk usage —
the one part of the dashboard not backed by `wpdev` at all, since there's no
WordPress-domain judgment call in reading `/proc/meminfo`/`/proc/stat`/`df`
for a second implementation to drift from. On Docker Desktop (Mac/Windows)
this reports the Linux VM's resources, not the raw host hardware — the more
useful number anyway, since that VM is the real ceiling on what this stack
can use.

Disk shows two different numbers on purpose: the bar is the whole
partition holding this project (`df` — "is this drive about to fill up"),
while the smaller line under it is just wp-local-dev's own footprint
(`sites/` + `snapshots/` + `backups/`, the same thing Doctor's own disk
line already reports) — "how much has this project itself used." They're
easy to conflate but answer different questions, especially if this
project shares a partition with anything else.

A **Docs** button in the header opens this README itself, rendered in the
dashboard — a searchable sidebar table of contents next to the full text,
so there's one explanation of this project instead of a second, shorter one
duplicated into the UI. It's the real `README.md`, imported directly at
build time (not copied), so it can't drift out of sync with this file; the
search box filters the table of contents to headings whose title or body
text matches, and each entry jumps to its section like any in-page anchor
link.

**Worth knowing:**

- **Every action that stops a container, overwrites data, or runs an
  arbitrary command asks for confirmation first** — Restart, Down, cache
  purge, clone, restore, and running a WP-CLI command all show a yes/no
  dialog describing exactly what's about to happen; removing a site asks
  you to type its domain, the same higher bar the CLI itself uses. Up,
  viewing status/doctor/creds, and toggling cache on/off don't ask, since
  none of them stop anything or lose data.
- **Bound to `127.0.0.1` only**, same reasoning as the API it talks to —
  it's just the UI, but there's no reason to expose it further than the
  service doing the actual work.
- **No build-time coupling to `API_PORT`.** Changing `API_PORT` in `.env`
  and restarting (not rebuilding) the `dashboard` container picks it up —
  a small `config.js` is regenerated from the current `.env` on every
  container start.
- **The small version badge next to "local-dev"** is `git describe` for
  whatever commit is actually checked out (tag, commits-since, short
  hash — `-dirty` appended over uncommitted changes), re-detected on
  every `wpdev up` the same way `API_UID`/`PROJECT_DIR` are. Not a
  hand-maintained version number that can fall out of sync with reality.
- **A green "Update available" badge** shows up next to it when `git
  fetch` finds commits on `origin` this checkout doesn't have yet (`wpdev
  update-check`, checked on load and on every manual refresh — not on the
  15s poll, since that would mean a `git fetch` every 15 seconds).
  Clicking it confirms, then streams `wpdev update` live the same way
  adding a site does: pulls, rebuilds, and recreates every container. The
  api is rebuilt and recreated last, a few seconds after the stream
  finishes, so the dashboard briefly shows "unreachable" before it
  reconnects. Reload the page afterwards to pick up a new dashboard build
  and version badge.
- **A "Reissue HTTPS certificate" button** in each site's Overview tab runs
  `wpdev cert` for that site (after a confirmation). Use it when Doctor
  flags the cert, or your browser shows a certificate warning.
- **The API token**, if you've set `API_TOKEN`, goes in the dashboard's own
  settings panel (⚙ in the header) — it's stored in your browser's
  `localStorage`, sent as `Authorization: Bearer <token>` on every request,
  and never touches the image or the container.

## Project structure

```
wp-local-dev/
├── docker-compose.yml           # mysql, php81-84, redis, mailpit, nginx, adminer, portainer, api, dashboard
├── .env                         # DB password, ports, optional build proxy (git-ignored)
├── .env.example                 # template for .env, copied by install.sh
├── wpdev                        # the whole interface — `wpdev help` (see Getting started)
├── install.sh                   # curl|bash installer (see Installation)
├── install-mkcert.sh            # one-time mkcert installer, called by `wpdev install-mkcert`
│
├── completions/                 # see Tab completion
│   ├── fish/wpdev.fish
│   ├── bash/wpdev.bash
│   └── zsh/{_wpdev,wpdev.plugin.zsh}
│
├── api/                         # HTTP API wrapping wpdev — see "API service"
│   ├── Dockerfile
│   ├── entrypoint.sh            # drops from root to your own uid/gid before running anything
│   ├── server.js
│   ├── lib/
│   │   ├── wpdev.js              # exec/stream wrapper — the only code that calls wpdev
│   │   └── systemStats.js        # host CPU/memory/disk -- not wpdev, see "Web dashboard"
│   └── package.json
│
├── dashboard/                   # React GUI for the api service — see "Web dashboard"
│   ├── Dockerfile                # build: npm run build; runtime: nginx serving dist/
│   ├── docker-entrypoint.sh      # renders config.js from .env's API_PORT on every start
│   ├── nginx.conf
│   └── src/
│       ├── api.js                # fetch + SSE client for the api service
│       ├── theme.js               # dark/light persistence, follows prefers-color-scheme
│       └── components/
│           ├── Header.jsx, SitesPanel.jsx, MachineStats.jsx
│           ├── AddSiteDialog.jsx, SiteManageDialog.jsx, ConfirmDialog.jsx
│           ├── LogModal.jsx, StatusTable.jsx, Terminal.jsx
│
├── php/
│   ├── Dockerfile               # wordpress:php${PHP_VERSION}-fpm + xdebug + phpredis + msmtp + cron + wp-cli
│   ├── install-php-extensions   # mlocati/docker-php-extension-installer, used by the Dockerfile
│   ├── xdebug.ini
│   ├── mail.ini                 # sendmail_path -> msmtp
│   ├── msmtprc                  # msmtp: relay to mailpit:1025
│   ├── crontab                  # /etc/cron.d entry — baked into the image, see "Real WP-Cron"
│   ├── wp-cron-runner.sh        # runs due cron events for every site, once a minute
│   └── entrypoint.sh            # starts cron, then hands off to the base image's entrypoint
│
├── nginx/
│   ├── nginx.conf
│   ├── sites/                   # one *.conf per site, served directly — no enable/disable step
│   │   ├── site.conf.template   # used by `wpdev add`
│   │   ├── site.conf.cached.template  # used by `wpdev cache <site> on`
│   │   └── default.conf         # catch-all for unmatched domains
│   └── ssl/{certs,private}/     # mkcert output
│
├── sites/<name>/                 # WordPress core + wp-content for each site (git-ignored)
│   ├── .admin-password          # generated by `wpdev add`
│   ├── .db-password
│   └── .php-version             # which PHP container serves this site (see "Multiple PHP versions")
│
├── logs/
│   ├── nginx/                   # access/error logs, per site
│   └── cron.log                 # real WP-Cron activity, every site, one file
│
├── snapshots/<site>/            # `wpdev snapshot`/`restore` (git-ignored, created on demand)
├── backups/                      # `wpdev backup`/`db-export` (git-ignored, created on demand)
│
├── .vscode/launch.json          # Xdebug VS Code config, shipped — see "Xdebug"
└── .github/workflows/           # CI: provisions real sites and exercises every feature above on each push
```

## Host environment

Four things *outside* this repo break the stack in ways whose error messages
point nowhere near their cause. `wpdev doctor` reports all four; `wpdev up`
repairs the two that are unambiguously broken settings rather than choices.

### Builds run in the host network namespace

Every `build:` here sets `network: host`, so build steps resolve names and
reach the internet exactly the way any other process on the machine does.
This is not a performance tweak — it's what keeps builds working on a
machine whose *container* networking is unusable, which on a corporate
laptop is the normal case rather than the exception. A bridge-network build
inherits whatever resolver the host advertises, and if that resolver lives
behind a VPN tunnel the build can't reach it (see below).

It's also the only reason the `HTTP_PROXY` in `.env.example` can say
`127.0.0.1` — on a bridge network that address is the build container
itself, not your proxy.

The php images had this from early on and the `api`/`dashboard` images did
not, which produced a memorable afternoon: `php82` built fine while
`dashboard` failed on `npm ci` and `api` failed on `apt-get`, every time, on
the same machine and the same network. If you add a service with a `build:`
stanza, give it `network: host` and the three proxy args too, or it will
fail alone and look like a mystery.

### A credential helper that isn't installed

If `~/.docker/config.json` carries a `"credsStore"` naming a helper binary
that isn't on `PATH` — classically `"desktop"`, left behind by a Docker
Desktop that's since been removed — then *every* image pull dies before it
reaches the registry:

```
error getting credentials - err: exec: "docker-credential-desktop":
executable file not found in $PATH
```

Nothing is wrong with the stack; `wpdev up` just can't fetch its first
image. `wpdev up` detects this, drops the dead key (keeping a timestamped
backup next to the file), and carries on. No sudo needed.

One consequence worth knowing: credentials that helper was storing are gone
with it, so a private registry will want a fresh `docker login`, and that
login lands base64'd in `config.json` rather than in a keyring. To keep a
keyring, install one (`apt install golang-docker-credential-helpers` on
Debian or Ubuntu) and set `"credsStore": "secretservice"`.

### A VPN resolver containers can't route to

With a corporate VPN connected — Cisco AnyConnect's `cscotun0`, WireGuard,
plain `tun0` — systemd-resolved's uplink is usually a private address routed
*through the tunnel*. Docker copies that address into every container's
`/etc/resolv.conf`, but packets from a bridge network never enter the
tunnel, so lookups from inside a running container time out.

Because builds use `network: host`, this does **not** break them. What it
breaks is everything a *running* container fetches: `wp plugin install`,
`composer install`, a plugin update from wp-admin. And `docker pull` keeps
working throughout, since the daemon resolves on the host — so the stack
looks healthy right up until WordPress tries to reach the network.

`wpdev up` repairs it: systemd-resolved is told to listen on docker0's
gateway as well as `127.0.0.53`, the daemon's `dns` is pointed at that
gateway, port 53 is opened from `172.16.0.0/12` if ufw is active, both
services restart, and a lookup from a real container is verified before the
stack starts. Containers end up asking the host, and the host forwards over
the tunnel like everything else — so it holds whether or not the VPN is
connected, and it's a one-time repair rather than a per-session toggle.

```bash
wpdev fix-dns     # the same repair, on its own
```

It needs `sudo`, so expect a password prompt the first time — in keeping
with `wpdev add`, which already appends to `/etc/hosts` with sudo, and
`wpdev install-mkcert`, which installs packages. `/etc/docker/daemon.json`
is backed up and *merged*, never overwritten, so registry mirrors, log
limits and proxy settings survive.

The one part that can't be silent is the daemon restart: `dns` isn't among
the options dockerd re-reads on `SIGHUP`, so the daemon has to restart, and
that stops every running container. This stack's own containers are fair
game — the `up` in progress is about to recreate them — but if anything else
is running on the daemon, `up` lists those containers by name and waits for
a yes. It works out which are foreign by diffing `docker ps` against
`docker compose ps`, so a clone in a differently-named directory behaves
correctly.

If a container can't reach even its own gateway, that's not DNS and no
resolver setting will help — a host firewall or a VPN enforcing tunnel-all
against `172.16.0.0/12` is dropping everything. `doctor` says so explicitly
rather than blaming the resolver, and names the VPN client if one is
running.

### A proxy that's configured but not running

Builds inherit `HTTP_PROXY` (from `.env` or your environment, passed as a
build arg), and apt and npm obey it absolutely: with the proxy down they do
not fall back to a direct connection, they fail. Several minutes in, as
`Connection refused [IP: 127.0.0.1 10808]` buried in apt output, which reads
like a mirror problem rather than a local one. `up` and `doctor` check it
with a single TCP connect before anything tries to build through it — a
local proxy (xray, v2ray, an SSH tunnel) not being up yet is an ordinary
morning.

Note that this covers *builds only*. Image pulls — every `FROM`, every
`docker pull` — are the daemon's work, and dockerd reads neither your shell
environment nor a build arg. On a network that throttles or resets Docker
Hub, the result is builds whose apt and npm steps fly through the proxy
while the base-image pulls ahead of them crawl and die on `connection reset
by peer` from the registry CDN. The fix is a `"proxies"` block in
`/etc/docker/daemon.json`:

```json
{
  "proxies": {
    "http-proxy": "http://127.0.0.1:10808",
    "https-proxy": "http://127.0.0.1:10808",
    "no-proxy": "localhost,127.0.0.1,*.internal.example"
  }
}
```

`doctor` points this out when a reachable build proxy exists and the daemon
has none, but `up` does not do it for you: sending every registry pull on
the machine through a personal proxy is a policy choice, not a broken
setting, and plenty of people set `HTTP_PROXY` for builds alone on purpose.

### Escape hatches

- `WPDEV_SKIP_DNS_FIX=1 wpdev up` skips the DNS and connectivity checks and
  their repair entirely, for a machine managed some other way.
- On CI, or anywhere with no TTY and no cached sudo credentials, `up` stops
  with instructions rather than hanging on a prompt.

## Troubleshooting

| Problem | Fix |
|---|---|
| `wpdev: command not found` | Either re-run the symlink step above, or use `./wpdev` instead (from inside this folder) |
| SSL not trusted | `wpdev install-mkcert` |
| Can't reach a site | `cat /etc/hosts \| grep <domain>` — add via `wpdev hosts` |
| 502 Bad Gateway | `docker compose restart php81 php82 php83 php84` (there's no single `php` service — see "Multiple PHP versions") |
| Nginx won't reload | `docker exec wp-nginx nginx -t` for the actual error |
| Permission denied under `sites/` | `sudo chown -R $USER:$USER sites/` |
| `error getting credentials - err: exec: "docker-credential-…"` | A `credsStore` in `~/.docker/config.json` naming a helper that isn't installed — `wpdev up` repairs this for you, no sudo needed (see "Host environment") |
| A build fails on `Temporary failure resolving …` while pulls work | That service's `build:` is missing `network: host` — compare it with the php services (see "Host environment") |
| A build fails on `Connection refused [IP: 127.0.0.1 10808]` | Your `HTTP_PROXY` is set but the proxy isn't running — start it, or unset `HTTP_PROXY`/`HTTPS_PROXY`. `wpdev up` now checks this before building |
| Base-image pulls crawl, or die on `connection reset by peer` | The daemon doesn't use your build proxy — add a `"proxies"` block to `/etc/docker/daemon.json` (see "Host environment") |
| `wp plugin install` or `composer` hangs inside a container | A VPN resolver containers can't route to — `wpdev up` repairs this automatically (needs sudo), or `wpdev fix-dns` (see "Host environment") |
| `docker compose build` fails to reach the internet | your network may need a proxy — set `HTTP_PROXY`/`HTTPS_PROXY` in `.env` (see `.env.example`); left unset, no proxy is used |
| `docker pull`/`docker compose up` fails (CDN block or "RBAC: access denied") | Docker Hub geo-blocking, not a config error — `.env`'s proxy only covers the `php` image *build*, not plain `docker pull`. Retry with `HTTP_PROXY=http://<proxy> HTTPS_PROXY=http://<proxy> docker pull <image>` once, then `wpdev up` normally |

## Notes

- Local development only — `.env` holds a plaintext root DB password by design.
- mkcert certificates are trusted locally only.
- For production, use real SSL (Let's Encrypt) and don't reuse this compose file as-is.
