#!/bin/sh
# Run by the nginx image's own entrypoint (mounted into /docker-entrypoint.d/
# by docker-compose.yml) before nginx starts.
#
# Renumbers the `nginx` user -- the one worker processes run as -- to the
# host developer's uid/gid, the same uid PHP-FPM runs as (php/entrypoint.sh).
# The full-page cache is shared between the two: nginx writes entries as
# 0600 files in 0700 directories, and nginx-helper (in PHP) purges a page by
# deleting its file. Under different uids PHP can't, so a post saved in
# wp-admin left its stale page cached. (#21) Alpine has no usermod, hence
# editing passwd/group directly.
set -e
uid="${HOST_UID:-}"
gid="${HOST_GID:-$uid}"
{ [ -n "$uid" ] && [ "$uid" != "0" ]; } || exit 0

if [ "$(id -u nginx)" != "$uid" ]; then
    sed -i "s/^nginx:x:[0-9]*:[0-9]*:/nginx:x:${uid}:${gid}:/" /etc/passwd
    sed -i "s/^nginx:x:[0-9]*:/nginx:x:${gid}:/" /etc/group
fi
# Entries a previous worker uid already wrote (the cache is a volume).
chown -R "${uid}:${gid}" /var/cache/nginx
