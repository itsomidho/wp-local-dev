#!/bin/bash

# One-line installer for wp-local-dev:
#   curl -fsSL https://raw.githubusercontent.com/itsomidho/wp-local-dev/main/install.sh | bash
#   wget -qO- https://raw.githubusercontent.com/itsomidho/wp-local-dev/main/install.sh | bash
#
# Downloads the latest release (plain files, no git: it's a tool you run,
# not a repo you work in), sets up .env from .env.example, and symlinks
# `wpdev` onto PATH. `wpdev update` later fetches newer releases the same
# way, leaving your sites and settings alone.
#
#   WP_LOCAL_DEV_DIR=~/somewhere   install there instead of ~/wp-local-dev
#   WP_LOCAL_DEV_VERSION=v2.5.0    a specific release instead of the latest
#   WP_LOCAL_DEV_GIT=1             a git clone instead (to work on wp-local-dev
#                                  itself; then `wpdev update` uses git pull)
# Doesn't touch the rest of the host system otherwise — no sudo, no
# package installs. Docker itself and mkcert (trusted local SSL) are
# separate, deliberate steps (see README / `wpdev install-mkcert`) since
# they're bigger asks than cloning a dev environment.

set -e

REPO="itsomidho/wp-local-dev"
REPO_URL="https://github.com/${REPO}.git"
INSTALL_DIR="${WP_LOCAL_DEV_DIR:-$HOME/wp-local-dev}"
BIN_DIR="${WP_LOCAL_DEV_BIN_DIR:-$HOME/.local/bin}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "wp-local-dev installer"
echo "======================="
echo

http_get() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --max-time 300 "$1"
    else
        wget -qO- --timeout=300 "$1"
    fi
}

# Same list as wpdev's build_manifest: every file's checksum, so `wpdev
# update` can tell which ones you've changed.
build_manifest() {
    (cd "$1" && find . -type f ! -path ./VERSION ! -path ./.wpdev-manifest -exec sh -c '
        if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi' sh {} + | sort -k2)
}

if [ "${WP_LOCAL_DEV_GIT:-}" = "1" ]; then
    command -v git >/dev/null 2>&1 || print_error "git is required for WP_LOCAL_DEV_GIT=1 but not found."
else
    command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || print_error "curl or wget is required but neither was found."
    command -v tar >/dev/null 2>&1 || print_error "tar is required but not found."
fi
command -v docker >/dev/null 2>&1 || print_error "docker is required but not found. Install Docker first: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || print_error "docker compose (the v2 plugin) is required but not found."
print_info "docker and docker compose found"

if [ -e "$INSTALL_DIR" ]; then
    if [ -f "$INSTALL_DIR/wpdev" ] && { [ -f "$INSTALL_DIR/VERSION" ] || [ -d "$INSTALL_DIR/.git" ]; }; then
        print_warning "${INSTALL_DIR} already has wp-local-dev — leaving it as-is. To get the newest release: wpdev update"
    else
        print_error "${INSTALL_DIR} already exists and isn't a wp-local-dev install. Set WP_LOCAL_DEV_DIR to a different path and re-run."
    fi
elif [ "${WP_LOCAL_DEV_GIT:-}" = "1" ]; then
    print_info "Cloning into ${INSTALL_DIR}"
    git clone "$REPO_URL" "$INSTALL_DIR"
else
    VERSION="${WP_LOCAL_DEV_VERSION:-}"
    if [ -z "$VERSION" ]; then
        # The newest release, from the releases feed (no API token needed).
        VERSION="$(http_get "https://github.com/${REPO}/releases.atom" | grep -o 'releases/tag/[^"]*' | sed 's#releases/tag/##' | sort -V | tail -n1)"
        [ -n "$VERSION" ] || print_error "Couldn't find the latest release on github.com — check your connection, or set WP_LOCAL_DEV_VERSION=v2.5.0."
    fi
    print_info "Downloading wp-local-dev ${VERSION}"
    # Unpacked next to where it's going, so the final move is a rename.
    mkdir -p "$(dirname "$INSTALL_DIR")"
    TMP_DIR="$(mktemp -d "$(dirname "$INSTALL_DIR")/.wp-local-dev-install.XXXXXX")"
    trap 'rm -rf "$TMP_DIR"' EXIT
    http_get "https://github.com/${REPO}/archive/refs/tags/${VERSION}.tar.gz" | tar -xz -C "$TMP_DIR" --strip-components=1 \
        || print_error "Downloading ${VERSION} failed — is it a release of ${REPO}?"
    build_manifest "$TMP_DIR" > "$TMP_DIR/.wpdev-manifest"
    printf '%s\n' "$VERSION" > "$TMP_DIR/VERSION"
    chmod 755 "$TMP_DIR"   # mktemp makes it owner-only
    mv "$TMP_DIR" "$INSTALL_DIR"
    trap - EXIT
    print_info "Installed ${VERSION} into ${INSTALL_DIR}"
fi

cd "$INSTALL_DIR"

if [ -f .env ]; then
    print_warning ".env already exists, leaving it as-is"
else
    cp .env.example .env
    print_info "Created .env from .env.example"
fi

chmod +x wpdev install-mkcert.sh 2>/dev/null || true

mkdir -p "$BIN_DIR"
ln -sf "${INSTALL_DIR}/wpdev" "${BIN_DIR}/wpdev"
print_info "Linked wpdev -> ${BIN_DIR}/wpdev"

case ":$PATH:" in
    *":${BIN_DIR}:"*) ;;
    *)
        print_warning "${BIN_DIR} isn't on your PATH yet — add this to your shell profile:"
        echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
        ;;
esac

echo
print_info "Installed at ${INSTALL_DIR}"
echo
echo "Next steps:"
echo "  wpdev install-mkcert   # one-time: trusted local SSL"
echo "  wpdev up                # start the stack"
echo "  wpdev add                # provision your first site"
