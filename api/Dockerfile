# Thin HTTP API wrapping `wpdev` -- see server.js. This container has no
# Docker daemon of its own: it talks to the HOST's daemon over a
# bind-mounted socket (docker-compose.yml).
FROM node:20-slim

# Docker CLI + compose plugin, installed the official documented way
# (https://docs.docker.com/engine/install/debian/) rather than downloading
# a pinned static binary -- this matches the floating-tag philosophy this
# project already uses for its other utility services (adminer and
# mailpit both run :latest in docker-compose.yml), and the version this
# installs is whatever's current, not something that goes stale in this
# Dockerfile. $VERSION_CODENAME is read from the base image's own
# /etc/os-release rather than hardcoded, so this doesn't silently break the
# next time the node:20-slim image moves to a newer Debian release. git is
# here for `wpdev update`/`update-check`, run through this container same
# as everything else -- node:20-slim doesn't include it. buildx too: without
# it compose falls back to the legacy builder, which rejects BuildKit-only
# syntax like php/Dockerfile's `COPY --chmod`, so a dashboard Update could
# pull new code but never build it. (#18)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg util-linux git \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

# mkcert -- so `wpdev add`/`clone`, run through this API, can still generate
# real SSL certificates exactly like running them from the host. Resolved
# via the GitHub API rather than a hardcoded version/filename, same
# always-current reasoning as the Docker CLI above.
RUN curl -fsSL https://api.github.com/repos/FiloSottile/mkcert/releases/latest \
      | grep -o '"browser_download_url": *"[^"]*linux-amd64"' \
      | head -1 \
      | cut -d'"' -f4 \
      | xargs curl -fsSL -o /usr/local/bin/mkcert \
    && chmod +x /usr/local/bin/mkcert

WORKDIR /srv/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/server.js ./
COPY api/lib/ ./lib/

COPY --chmod=0755 api/entrypoint.sh /usr/local/bin/api-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]

EXPOSE 9090
CMD ["node", "server.js"]
