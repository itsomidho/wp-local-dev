# Bash completion for wpdev (wp-local-dev's CLI).
#
# Install: source this file from ~/.bashrc, e.g.:
#   source /path/to/wp-local-dev/completions/bash/wpdev.bash
# or, with the bash-completion package, symlink it (no .bash extension) into
# its user completions directory:
#   ln -sf /path/to/wp-local-dev/completions/bash/wpdev.bash \
#       ~/.local/share/bash-completion/completions/wpdev
#
# Written without relying on the bash-completion package's _init_completion
# helper, so it works even on a bare bash with no extra package installed.
#
# Site-name completion resolves wpdev's own project directory the same way
# wpdev itself does (readlink -f on its own path, see SCRIPT_DIR in wpdev),
# and reads nginx/sites/*.conf -- the same source wpdev's own site_domains()
# treats as authoritative -- not sites/*/, which can contain stray leftover
# directories that were never actually provisioned.

_wpdev_root() {
    local p
    p="$(command -v wpdev 2>/dev/null)" || return 1
    dirname "$(readlink -f "$p")"
}

_wpdev_sites() {
    local root f name
    root="$(_wpdev_root)" || return
    for f in "$root"/nginx/sites/*.conf; do
        [ -e "$f" ] || continue
        name="$(basename "$f" .conf)"
        [ "$name" = "default" ] && continue
        echo "${name%.test}"
    done
}

_wpdev_complete() {
    local cur prev cmds subcmd
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmds="up down restart update update-check status doctor logs shell db adminer portainer mailpit reload-nginx cache cache-purge backup restore-all install-mkcert clean clean-all uninstall add remove clone snapshot restore db-export db-import list hosts creds cert fix-perms media-proxy admin-domain wp help"

    if [ "$COMP_CWORD" -eq 1 ]; then
        COMPREPLY=($(compgen -W "$cmds" -- "$cur"))
        return
    fi

    subcmd="${COMP_WORDS[1]}"
    case "$subcmd" in
        remove|snapshot|restore|db-export|db-import|creds|cert|fix-perms|media-proxy|admin-domain|wp|clone|db|adminer)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            fi
            ;;
        cache)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "on off" -- "$cur"))
            fi
            ;;
        shell)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "php db nginx redis" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ] && [ "$prev" = "php" ]; then
                COMPREPLY=($(compgen -W "8.1 8.2 8.3 8.4" -- "$cur"))
            fi
            ;;
        logs)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "mysql php81 php82 php83 php84 redis mailpit nginx adminer portainer" -- "$cur"))
            fi
            ;;
        restore-all)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -f -- "$cur"))
            fi
            ;;
        db-import)
            if [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -f -- "$cur"))
            fi
            ;;
    esac
}

complete -F _wpdev_complete wpdev
