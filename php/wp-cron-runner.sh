#!/bin/bash
# Runs WordPress's real cron queue for every site, once a minute (see
# php/crontab). Pairs with DISABLE_WP_CRON in wp-config.php — without a real
# cron loop, WordPress's page-load-triggered pseudo-cron doesn't fire
# reliably on a quiet local dev site, so scheduled posts, WooCommerce order
# processing, etc. can silently not run.
#
# Absolute path to wp, not just `wp` — cron's default PATH doesn't include
# /usr/local/bin, so a bare `wp` fails with "command not found" here even
# though it works fine everywhere else (interactive shell, docker exec).
#
# flock: cron starts a new instance every minute regardless of whether the
# previous one finished. A single slow event (a big backlog on first run, or
# just a slow plugin hook) can take longer than a minute, and without this,
# overlapping instances pile up — observed for real while building this: a
# 125-second event caused 3 concurrent runs stacked on top of each other.
# In /tmp, not /var/run: this runs as www-data (see php/crontab), which
# can't write /var/run.
exec 200>/tmp/wp-cron-runner.lock
flock -n 200 || { echo "[wp-cron] $(date '+%Y-%m-%d %H:%M:%S') previous run still in progress, skipping"; exit 0; }

# Multiple PHP versions each run their own copy of this script in their own
# container, all sharing the same /var/www — so each must only process sites
# actually assigned to ITS version. Getting this wrong wouldn't just
# double-run cron: a site assigned to 8.4 would have its scheduled events
# executed under 8.1's interpreter instead, which can outright fatal-error
# on version-specific syntax.
#
# A site's PHP_VERSION and on/off state (SITE_STATE, `wpdev off`) come from
# wpdev's config/sites/<name>.env, mounted read-only at /etc/wpdev/sites. A
# site with no PHP_VERSION there gets the default version; one switched off
# is skipped, so it costs nothing until it's turned back on. (These used to
# be read from sites/<name>/.php-version, which wpdev stopped writing when
# its settings moved to config/sites -- every site then ran under 8.2.)
#
# Read from /etc/php-version (written by entrypoint.sh at container start),
# NOT $PHP_VERSION — cron jobs get a stripped environment that never sees
# Docker's ENV, and php-fpm's own master process clears its environment
# internally too, so there is no env var to read at all by the time this runs.
my_version="$(cat /etc/php-version 2>/dev/null)"
[ -z "$my_version" ] && my_version="8.2"
default_version="8.2"
config_dir="/etc/wpdev/sites"

# site_setting <site-name> <KEY>: the value saved in its settings, or nothing.
site_setting() {
    sed -n "s/^$2=//p" "${config_dir}/$1.env" 2>/dev/null | tail -1
}

for config in /var/www/*/wp-config.php; do
    [ -f "$config" ] || continue
    site_dir="$(dirname "$config")"
    site_name="$(basename "$site_dir")"
    [ "$(site_setting "$site_name" SITE_STATE)" = "off" ] && continue
    site_version="$(site_setting "$site_name" PHP_VERSION)"
    [ -z "$site_version" ] && site_version="$default_version"
    [ "$site_version" = "$my_version" ] || continue
    echo "[wp-cron] $(date '+%Y-%m-%d %H:%M:%S') ${site_dir} (php${my_version})"
    /usr/local/bin/wp cron event run --due-now --path="$site_dir" --allow-root 2>&1
done
