# Which WordPress PHP-FPM image to build — set per service in
# docker-compose.yml (one service per supported PHP version).
ARG PHP_VERSION=8.2
FROM wordpress:php${PHP_VERSION}-fpm

# Re-declare after FROM (build args from before FROM don't carry over) so
# wp-cron-runner.sh can read its own container's version via $PHP_VERSION —
# that's how it knows which sites are actually its to run, not just every
# site on the shared filesystem.
ARG PHP_VERSION
ENV PHP_VERSION=${PHP_VERSION}

# PHP 7.4 and 8.0 (end of life) are built on Debian 11 "bullseye", whose
# support has ended too: its security updates are moving off the normal
# mirrors, so packages the index still lists come back 404. Debian keeps
# every retired release on archive.debian.org, so a base on bullseye
# installs from there (Check-Valid-Until off: an archived release's
# signatures are never refreshed). Newer bases are left untouched.
RUN . /etc/os-release; \
    if [ "$VERSION_CODENAME" = "bullseye" ]; then \
        printf 'deb http://archive.debian.org/debian bullseye main\ndeb http://archive.debian.org/debian bullseye-updates main\ndeb http://archive.debian.org/debian-security bullseye-security main\n' > /etc/apt/sources.list; \
        rm -f /etc/apt/sources.list.d/*; \
        echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99archive; \
    fi

COPY --chmod=0755 php/install-php-extensions /usr/local/bin/install-php-extensions

# apt-get update first: install-php-extensions doesn't reliably run it itself,
# and the wordpress:phpX-fpm base image is a floating tag — it moved to a
# newer Debian release (trixie) upstream since this was last built, so an
# apt cache baked into an older pull of the same tag can 404 on redis's
# optional compression deps (libzstd-dev, liblz4-dev) without this.
RUN apt-get update
RUN install-php-extensions xdebug redis

# msmtp: relays PHP's mail() (what wp_mail() uses by default) to the shared
# Mailpit container, so every site's outgoing mail is caught automatically —
# no per-site plugin or WordPress config needed. See php/msmtprc + php/mail.ini.
#
# cron: runs a real WP-Cron loop for every site once a minute (see
# php/crontab + php/wp-cron-runner.sh), instead of relying on WordPress's
# page-load-triggered pseudo-cron, which doesn't fire reliably on a quiet
# local dev site.
RUN apt-get update && apt-get install -y --no-install-recommends msmtp cron && rm -rf /var/lib/apt/lists/*

# Baked in (not bind-mounted like the other php/ configs) because Debian's
# cron silently ignores /etc/cron.d files that aren't root-owned and
# non-group-writable — a bind mount inherits the host file's ownership
# (the host user, not root), which cron rejects with zero error output
# anywhere (no syslog in this minimal image). COPY --chown/--chmod sets
# correct ownership at build time regardless of the host file's own perms.
COPY --chown=root:root --chmod=0644 php/crontab /etc/cron.d/wp-cron

# WP-CLI: drives site provisioning (DB + wp-config + core install + the
# redis-cache plugin) from `wpdev add`, and is available for ad-hoc use via
# `wpdev wp <name> <args...>`.
ADD --chmod=0755 https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar /usr/local/bin/wp

# Custom entrypoint just starts the cron daemon before handing off to the
# base image's own entrypoint (which still execs php-fpm as normal).
COPY --chmod=0755 php/entrypoint.sh /usr/local/bin/custom-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
CMD ["php-fpm"]
