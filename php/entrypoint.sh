#!/bin/bash
# Starts the cron daemon (self-daemonizes/forks, so this returns immediately)
# before handing off to the base image's real entrypoint, which execs
# php-fpm as the container's foreground/PID 1 process as usual.
#
# Bind-mounted from php/ (docker-compose.yml), not baked into the image, so
# a change here applies on the next container start without a rebuild.
set -e

# Cron jobs run with a stripped environment and never see Docker's ENV
# PHP_VERSION — confirmed the hard way: php-fpm's own master process clears
# its environment internally (even /proc/1/environ comes up empty), so
# there's no way to recover it from inside a cron job at all. Writing it to
# a plain file here, before cron or php-fpm even start, sidesteps the whole
# problem — wp-cron-runner.sh reads this file instead of any env var.
echo "${PHP_VERSION:-8.2}" > /etc/php-version

# Run as the developer: renumber www-data -- the user PHP-FPM, wp-cli (wpdev
# runs it as www-data) and cron all use -- to the host user's uid/gid
# (HOST_UID/HOST_GID, from API_UID/API_GID that `wpdev up` detects). Every
# file any of them creates is then owned by you on the host: editable in
# your IDE, and writable by WordPress itself, with no group/umask juggling.
# Before this, wp-cli wrote as root and PHP as uid 33, each read-only to the
# other and to you. -o: the gid can legitimately collide with an existing
# group (e.g. macOS's staff = 20). Skipped for root (0), which has no
# meaningful "developer" to map to. (#20)
if [ -n "${HOST_UID:-}" ] && [ "${HOST_UID}" != "0" ] && [ "$(id -u www-data)" != "${HOST_UID}" ]; then
    groupmod -o -g "${HOST_GID:-$HOST_UID}" www-data
    usermod -o -u "${HOST_UID}" -g "${HOST_GID:-$HOST_UID}" www-data
fi

# cron.log is appended to by the cron job, which runs as www-data (see
# php/crontab) -- but on an install that predates that, it was created by
# root, and an unwritable log makes the shell redirect fail and cron drop
# the whole job silently: WP-Cron just stops. Hand it over first.
mkdir -p /var/log/wpdev
touch /var/log/wpdev/cron.log
chown www-data:www-data /var/log/wpdev/cron.log

# The crontab is bind-mounted too, but cron ignores a file in /etc/cron.d
# unless root owns it and it isn't group/world-writable -- which a host
# checkout's file can't promise. So install a root-owned copy.
if [ -f /usr/local/share/wpdev/crontab ]; then
    install -o root -g root -m 0644 /usr/local/share/wpdev/crontab /etc/cron.d/wp-cron
fi

cron
exec docker-entrypoint.sh "$@"
