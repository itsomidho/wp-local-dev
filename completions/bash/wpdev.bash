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
    local root f name site
    root="$(_wpdev_root)" || return
    for f in "$root"/nginx/sites/*.conf; do
        [ -e "$f" ] || continue
        name="$(basename "$f" .conf)"
        [ "$name" = "default" ] && continue
        # The site's name is the directory its vhost serves (any suffix).
        site="$(sed -n 's|^[[:space:]]*root /var/www/\([^/;]*\);.*|\1|p' "$f" | head -1)"
        echo "${site:-$name}"
    done
}

# A site's links (`wpdev unlink <site> <link>`): the paths wpdev recorded
# (LINKS in its config), and the names of linked plugins and themes.
_wpdev_links() {
    local root l e
    root="$(_wpdev_root)" || return
    for e in $(sed -n 's/^LINKS=//p' "$root/config/sites/$1.env" 2>/dev/null); do
        echo "${e%:rw}"
    done
    for l in "$root/sites/$1/wp-content/plugins"/* "$root/sites/$1/wp-content/themes"/*; do
        [ -L "$l" ] && echo "${l##*/}"
    done
}

_wpdev_complete() {
    local cur prev cmds subcmd
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmds="up down restart update update-check status doctor fix-vpn-network logs stats images volumes inspect shell db adminer mailpit reload-nginx cache cache-purge backup restore-all install-mkcert clean clean-all uninstall add remove clone snapshot restore db-export db-import db-tables db-backup db-backups debug debug-log share list hosts check-domain update-tlds open creds cert fix-perms media-proxy admin-domain link unlink links link-browse wp help"

    if [ "$COMP_CWORD" -eq 1 ]; then
        COMPREPLY=($(compgen -W "$cmds" -- "$cur"))
        return
    fi

    subcmd="${COMP_WORDS[1]}"
    case "$subcmd" in
        remove|snapshot|restore|db-tables|creds|cert|fix-perms|media-proxy|admin-domain|wp|clone|db|adminer)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            fi
            ;;
        open)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "--editor=nvim" -- "$cur"))
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
                COMPREPLY=($(compgen -W "7.4 8.0 8.1 8.2 8.3 8.4 8.5" -- "$cur"))
            fi
            ;;
        inspect)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "mysql php74 php80 php81 php82 php83 php84 php85 redis mailpit nginx adminer api dashboard" -- "$cur"))
            fi
            ;;
        images)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "--json rm prune" -- "$cur"))
            fi
            ;;
        volumes)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "--json rm" -- "$cur"))
            fi
            ;;
        stats)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
        restart)
            COMPREPLY=($(compgen -W "mysql php74 php80 php81 php82 php83 php84 php85 redis mailpit nginx adminer api dashboard" -- "$cur"))
            ;;
        logs)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "mysql php74 php80 php81 php82 php83 php84 php85 redis mailpit nginx adminer" -- "$cur"))
            fi
            ;;
        restore-all)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -f -- "$cur"))
            fi
            ;;
        # Not in the plain site-name branch above: bash takes the first
        # matching pattern, so they'd never get past their first argument.
        db-import)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -f -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--tables= --rewrite-urls --yes" -- "$cur"))
            fi
            ;;
        db-export)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--tables=" -- "$cur"))
            fi
            ;;
        db-backup)
            COMPREPLY=($(compgen -W "$(_wpdev_sites) --all --due --suffix=" -- "$cur"))
            ;;
        link)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -d -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--to= --name= --writable" -- "$cur"))
            fi
            ;;
        unlink)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_links "${COMP_WORDS[2]}")" -- "$cur"))
            fi
            ;;
        links)
            COMPREPLY=($(compgen -W "$(_wpdev_sites) --json" -- "$cur"))
            ;;
        link-browse)
            COMPREPLY=($(compgen -d -- "$cur"))
            ;;
        update-check)
            COMPREPLY=($(compgen -W "--porcelain" -- "$cur"))
            ;;
        debug)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "on off set" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 4 ] && [ "${COMP_WORDS[3]}" = set ]; then
                COMPREPLY=($(compgen -W "WP_DEBUG WP_DEBUG_LOG WP_DEBUG_DISPLAY SCRIPT_DEBUG SAVEQUERIES" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 5 ]; then
                COMPREPLY=($(compgen -W "true false" -- "$cur"))
            fi
            ;;
        share)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "on off" -- "$cur"))
            elif [ "${COMP_WORDS[3]}" = on ]; then
                COMPREPLY=($(compgen -W "--for= --public --password= --admin" -- "$cur"))
            fi
            ;;
        debug-log)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--lines= --follow clear" -- "$cur"))
            fi
            ;;
        db-backups)
            if [ "$COMP_CWORD" -eq 2 ]; then
                COMPREPLY=($(compgen -W "$(_wpdev_sites)" -- "$cur"))
            elif [ "$COMP_CWORD" -eq 3 ]; then
                COMPREPLY=($(compgen -W "schedule rm" -- "$cur"))
            elif [ "${COMP_WORDS[3]}" = schedule ]; then
                COMPREPLY=($(compgen -W "1h 6h 12h 1d 1w off --keep=" -- "$cur"))
            fi
            ;;
    esac
}

complete -F _wpdev_complete wpdev
