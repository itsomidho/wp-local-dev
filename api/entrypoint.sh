#!/bin/sh
set -e

# Starts as root (the image's default) purely to do the two things below
# that genuinely need it, then drops to the host-matching user for
# everything else -- this container has no other reason to run as root.
API_UID="${API_UID:-1000}"
API_GID="${API_GID:-1000}"

# mkcert needs a CAROOT it can both read and write as the unprivileged user
# we're about to drop to. Not /root/... -- chowning just that leaf
# directory wouldn't help, since /root itself is 700 and blocks traversal
# for anyone but root. $CAROOT is set in docker-compose.yml to a path
# outside /root for exactly this reason.
mkdir -p "$CAROOT"
chown -R "${API_UID}:${API_GID}" "$CAROOT"

# HOME stays "/root" (the root process's own env) unless we override it --
# the docker CLI then tries to read/write $HOME/.docker/config.json as this
# unprivileged user, fails with EACCES, and that failure cascades into
# mis-parsing every subsequent arg (confirmed live: `docker compose exec -T
# mysql true` came out as "unknown shorthand flag: 'T' in -T", as if
# "compose" had silently not been recognized at all). /tmp is writable by
# everyone and doesn't need to persist anything -- it's just where the CLI
# caches plugin/config lookups.
export HOME=/tmp

# Drop to API_UID:API_GID so every file wpdev writes directly to the
# bind-mounted project (snapshots, nginx configs, SSL certs, backups,
# .env -- anything that isn't written by a SEPARATE `docker compose exec`
# into mysql/phpXX, which have their own separate ownership story) ends up
# owned by the real developer on the host, not root. Found live: without
# this, `wpdev snapshot` run through the API left root-owned files/dirs
# under snapshots/ that the host user couldn't even `rm` without sudo --
# same bug class, same reasoning, as the www-data chgrp/setgid fix in
# `wpdev add` itself.
#
# DOCKER_GID is added as a supplementary group so that same unprivileged
# user can still reach the bind-mounted Docker socket (owned root:docker
# on the host). setpriv requires an explicit choice for what happens to
# supplementary groups when dropping privileges -- there's no implicit
# "keep root's groups" default to silently fall back on.
if [ -n "${DOCKER_GID:-}" ]; then
    exec setpriv --reuid="$API_UID" --regid="$API_GID" --groups="$DOCKER_GID" sh -c '
        mkcert -install >/tmp/mkcert-install.log 2>&1 || true
        exec "$@"
    ' -- "$@"
else
    exec setpriv --reuid="$API_UID" --regid="$API_GID" --clear-groups sh -c '
        mkcert -install >/tmp/mkcert-install.log 2>&1 || true
        exec "$@"
    ' -- "$@"
fi
