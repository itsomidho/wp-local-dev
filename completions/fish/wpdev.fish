# Fish completions for wpdev (wp-local-dev's CLI).
#
# Install: symlink or copy this file into ~/.config/fish/completions/wpdev.fish
# (fish autoloads completions from there by filename -- no reload needed once
# it's in place, just open a new tab or run `complete -e wpdev` then retype).
#
# Site-name completion resolves wpdev's own project directory the same way
# wpdev itself does (readlink -f on its own path, see SCRIPT_DIR in wpdev) --
# so this works regardless of where `wpdev` is symlinked from.

function __wpdev_root
    set -l p (command -v wpdev 2>/dev/null)
    test -n "$p"; or return 1
    dirname (readlink -f $p)
end

# Mirrors wpdev's own site_domains(): the authoritative site list comes
# from nginx/sites/*.conf, not sites/*/ -- the latter can contain stray
# leftover directories (an empty one, a half-removed site) that were never
# actually provisioned.
function __wpdev_sites
    set -l root (__wpdev_root)
    test -n "$root"; or return
    for f in $root/nginx/sites/*.conf
        set -l name (basename $f .conf)
        test "$name" = default; and continue
        string replace -r '\.test$' '' -- $name
    end
end

function __wpdev_php_versions
    echo 8.1
    echo 8.2
    echo 8.3
    echo 8.4
end

function __wpdev_services
    echo mysql
    echo php81
    echo php82
    echo php83
    echo php84
    echo redis
    echo mailpit
    echo nginx
    echo adminer
end

# True when the command line has exactly N tokens so far (`wpdev` itself
# counts as 1) -- used to target completion at one specific argument
# position instead of every position after a subcommand.
function __wpdev_arg_n
    test (count (commandline -opc)) -eq $argv[1]
end

function __wpdev_shell_php_chosen
    set -l cmd (commandline -opc)
    test (count $cmd) -ge 3; and test "$cmd[3]" = php
end

set -l __wpdev_cmds up down restart update update-check status doctor logs stats images volumes inspect shell db adminer mailpit reload-nginx cache cache-purge backup restore-all install-mkcert clean clean-all uninstall add remove clone snapshot restore db-export db-import list hosts creds cert fix-perms media-proxy admin-domain wp help

complete -c wpdev -f

set -l __wpdev_top "not __fish_seen_subcommand_from $__wpdev_cmds"
complete -c wpdev -n "$__wpdev_top" -a up -d "Start all containers"
complete -c wpdev -n "$__wpdev_top" -a down -d "Stop all containers"
complete -c wpdev -n "$__wpdev_top" -a stats -d "Live CPU/memory/network/disk I/O per container"
complete -c wpdev -n "$__wpdev_top" -a images -d "This project's images: list, rm <id>, prune"
complete -c wpdev -n "$__wpdev_top" -a volumes -d "This project's volumes: list, rm <name>"
complete -c wpdev -n "$__wpdev_top" -a inspect -d "A service's container details (secrets masked)"
complete -c wpdev -n "$__wpdev_top" -a restart -d "Restart all containers, or the named services"
complete -c wpdev -n "$__wpdev_top" -a update -d "git pull, then rebuild + recreate all containers"
complete -c wpdev -n "$__wpdev_top" -a update-check -d "Fetch and report whether an update is available"
complete -c wpdev -n "$__wpdev_top" -a status -d "Show container status"
complete -c wpdev -n "$__wpdev_top" -a doctor -d "Proactive health check"
complete -c wpdev -n "$__wpdev_top" -a logs -d "Tail logs (all services, or one)"
complete -c wpdev -n "$__wpdev_top" -a shell -d "Shell into a container"
complete -c wpdev -n "$__wpdev_top" -a db -d "Open a MySQL prompt"
complete -c wpdev -n "$__wpdev_top" -a adminer -d "Open Adminer in the browser"
complete -c wpdev -n "$__wpdev_top" -a mailpit -d "Open Mailpit in the browser"
complete -c wpdev -n "$__wpdev_top" -a reload-nginx -d "Test and reload Nginx config"
complete -c wpdev -n "$__wpdev_top" -a cache -d "Toggle nginx full-page cache for a site"
complete -c wpdev -n "$__wpdev_top" -a cache-purge -d "Clear the full-page cache"
complete -c wpdev -n "$__wpdev_top" -a backup -d "mysqldump --all-databases to backups/"
complete -c wpdev -n "$__wpdev_top" -a restore-all -d "Replace every database from a backup"
complete -c wpdev -n "$__wpdev_top" -a install-mkcert -d "One-time local CA setup for trusted SSL"
complete -c wpdev -n "$__wpdev_top" -a clean -d "Remove containers (keeps data)"
complete -c wpdev -n "$__wpdev_top" -a clean-all -d "Remove containers + volumes (deletes data)"
complete -c wpdev -n "$__wpdev_top" -a uninstall -d "Remove containers/volumes/images + the wpdev symlink"
complete -c wpdev -n "$__wpdev_top" -a add -d "Provision a new WordPress site"
complete -c wpdev -n "$__wpdev_top" -a remove -d "Delete a site"
complete -c wpdev -n "$__wpdev_top" -a clone -d "Duplicate a site under a new domain"
complete -c wpdev -n "$__wpdev_top" -a snapshot -d "Save a files+DB snapshot of a site"
complete -c wpdev -n "$__wpdev_top" -a restore -d "Restore a site from a snapshot"
complete -c wpdev -n "$__wpdev_top" -a db-export -d "Dump just that site's database"
complete -c wpdev -n "$__wpdev_top" -a db-import -d "Replace that site's database from a dump"
complete -c wpdev -n "$__wpdev_top" -a list -d "List configured site domains"
complete -c wpdev -n "$__wpdev_top" -a hosts -d "Print /etc/hosts entries needed for all sites"
complete -c wpdev -n "$__wpdev_top" -a creds -d "Show a site's admin/DB credentials"
complete -c wpdev -n "$__wpdev_top" -a cert -d "Reissue a site's HTTPS certificate"
complete -c wpdev -n "$__wpdev_top" -a fix-perms -d "Give a site's files back to you"
complete -c wpdev -n "$__wpdev_top" -a media-proxy -d "Load uploads missing locally from production"
complete -c wpdev -n "$__wpdev_top" -a admin-domain -d "Move wp-admin to a separate domain"
complete -c wpdev -n "$__wpdev_top" -a wp -d "Run a WP-CLI command against a site"
complete -c wpdev -n "$__wpdev_top" -a help -d "Show usage"

# Site-name completion for commands taking <site>/<name> as their 2nd token
for cmd in remove snapshot restore db-export db-import creds cert fix-perms media-proxy admin-domain wp clone db adminer cache
    complete -c wpdev -f -n "__fish_seen_subcommand_from $cmd; and __wpdev_arg_n 2" -a "(__wpdev_sites)"
end

# `shell php|db|nginx|redis`, then a PHP version if `php` was chosen
complete -c wpdev -f -n "__fish_seen_subcommand_from shell; and __wpdev_arg_n 2" -a "php db nginx redis"
complete -c wpdev -f -n "__fish_seen_subcommand_from shell; and __wpdev_shell_php_chosen; and __wpdev_arg_n 3" -a "(__wpdev_php_versions)"

# `logs [service]`
complete -c wpdev -f -n "__fish_seen_subcommand_from logs; and __wpdev_arg_n 2" -a "(__wpdev_services)"
# `inspect <service>`, `images [rm|prune]`, `volumes [rm]`
complete -c wpdev -f -n "__fish_seen_subcommand_from inspect; and __wpdev_arg_n 2" -a "(__wpdev_services)"
complete -c wpdev -f -n "__fish_seen_subcommand_from images; and __wpdev_arg_n 2" -a "rm prune --json"
complete -c wpdev -f -n "__fish_seen_subcommand_from volumes; and __wpdev_arg_n 2" -a "rm --json"
# `restart [service...]`
complete -c wpdev -f -n "__fish_seen_subcommand_from restart" -a "(__wpdev_services)"

# `cache <site> on|off`
complete -c wpdev -f -n "__fish_seen_subcommand_from cache; and __wpdev_arg_n 3" -a "on off"

# File completion for restore-all's and db-import's file argument -- no -f,
# so fish's normal filesystem completion applies here instead of just the
# fixed -a list every other rule above uses.
complete -c wpdev -n "__fish_seen_subcommand_from restore-all; and __wpdev_arg_n 2"
complete -c wpdev -n "__fish_seen_subcommand_from db-import; and __wpdev_arg_n 3"
