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
        # The site's name is the directory its vhost serves (any suffix).
        set -l site (sed -n 's|^[[:space:]]*root /var/www/\([^/;]*\);.*|\1|p' $f | head -1)
        test -n "$site"; and echo $site; or echo $name
    end
end

# The links of the site given as the 2nd token (`unlink`): the paths wpdev
# recorded, and the names of linked plugins and themes.
function __wpdev_links
    set -l root (__wpdev_root); or return
    set -l site (commandline -opc)[3]
    for e in (string split ' ' -- (sed -n 's/^LINKS=//p' $root/config/sites/$site.env 2>/dev/null))
        string replace -r ':rw$' '' -- $e
    end
    for l in $root/sites/$site/wp-content/plugins/* $root/sites/$site/wp-content/themes/*
        test -L $l; and basename $l
    end
end

function __wpdev_php_versions
    echo 7.4
    echo 8.0
    echo 8.1
    echo 8.2
    echo 8.3
    echo 8.4
    echo 8.5
end

function __wpdev_services
    echo mysql
    echo php74
    echo php80
    echo php81
    echo php82
    echo php83
    echo php84
    echo php85
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

set -l __wpdev_cmds up down restart update update-check status doctor fix-vpn-network logs stats images volumes inspect shell db adminer mailpit reload-nginx cache cache-purge backup restore-all install-mkcert clean clean-all uninstall add remove clone snapshot restore db-export db-import db-tables db-backup db-backups debug debug-log share list hosts check-domain update-tlds open creds cert fix-perms media-proxy admin-domain link unlink links link-browse wp help

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
complete -c wpdev -n "$__wpdev_top" -a fix-vpn-network -d "Move Docker networks off VPN-routed ranges"
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
complete -c wpdev -n "$__wpdev_top" -a db-tables -d "List that site's tables"
complete -c wpdev -n "$__wpdev_top" -a db-backup -d "Back up databases now"
complete -c wpdev -n "$__wpdev_top" -a db-backups -d "List, schedule or remove a site's backups"
complete -c wpdev -n "$__wpdev_top" -a debug -d "Show or change WordPress debug settings"
complete -c wpdev -n "$__wpdev_top" -a debug-log -d "Show, follow or clear a site's debug.log"
complete -c wpdev -n "$__wpdev_top" -a share -d "Share a site with other devices for a while"
complete -c wpdev -n "$__wpdev_top" -a list -d "List configured site domains"
complete -c wpdev -n "$__wpdev_top" -a hosts -d "Print /etc/hosts entries needed for all sites"
complete -c wpdev -n "$__wpdev_top" -a check-domain -d "Whether a domain is free for a new site"
complete -c wpdev -n "$__wpdev_top" -a update-tlds -d "Refresh the list of real top-level domains"
complete -c wpdev -n "$__wpdev_top" -a open -d "Open a site's folder in the file manager or Neovim"
complete -c wpdev -n "$__wpdev_top" -a creds -d "Show a site's admin/DB credentials"
complete -c wpdev -n "$__wpdev_top" -a cert -d "Reissue a site's HTTPS certificate"
complete -c wpdev -n "$__wpdev_top" -a fix-perms -d "Give a site's files back to you"
complete -c wpdev -n "$__wpdev_top" -a media-proxy -d "Load uploads missing locally from production"
complete -c wpdev -n "$__wpdev_top" -a admin-domain -d "Move wp-admin to a separate domain"
complete -c wpdev -n "$__wpdev_top" -a link -d "Use a folder from outside this project in a site"
complete -c wpdev -n "$__wpdev_top" -a unlink -d "Remove a linked folder from a site"
complete -c wpdev -n "$__wpdev_top" -a links -d "List linked folders"
complete -c wpdev -n "$__wpdev_top" -a link-browse -d "A folder's subfolders, marking plugins and themes"
complete -c wpdev -n "$__wpdev_top" -a wp -d "Run a WP-CLI command against a site"
complete -c wpdev -n "$__wpdev_top" -a help -d "Show usage"

# Site-name completion for commands taking <site>/<name> as their 2nd token
for cmd in remove snapshot restore db-export db-import db-tables db-backup db-backups debug debug-log share creds cert fix-perms media-proxy admin-domain wp clone db adminer cache open link unlink links
    complete -c wpdev -f -n "__fish_seen_subcommand_from $cmd; and __wpdev_arg_n 2" -a "(__wpdev_sites)"
end

# `link <site> <folder> [--to=] [--name=] [--writable]`, `unlink <site> <path|name>`, `links [site] [--json]`
complete -c wpdev -f -n "__fish_seen_subcommand_from link; and __wpdev_arg_n 3" -a "(__fish_complete_directories)"
complete -c wpdev -f -n "__fish_seen_subcommand_from link; and not __wpdev_arg_n 2; and not __wpdev_arg_n 3" -a "--to= --name= --writable"
complete -c wpdev -f -n "__fish_seen_subcommand_from unlink; and __wpdev_arg_n 3" -a "(__wpdev_links)"
complete -c wpdev -f -n "__fish_seen_subcommand_from links; and __wpdev_arg_n 2" -a "--json"
complete -c wpdev -f -n "__fish_seen_subcommand_from link-browse; and __wpdev_arg_n 2" -a "(__fish_complete_directories)"

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
complete -c wpdev -f -n "__fish_seen_subcommand_from db-import db-export" -r -l tables -d "Only these tables (comma-separated)"
complete -c wpdev -f -n "__fish_seen_subcommand_from update-check" -l porcelain -d "KEY=value lines, for scripts"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-backup" -l all -d "Every site"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-backup" -l due -d "Sites whose schedule says it's time"
complete -c wpdev -x -n "__fish_seen_subcommand_from db-backup" -l suffix -a "before-import before-update before-migration" -d "Ends the file name instead of manual"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-backups; and __wpdev_arg_n 3" -a "schedule rm"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-backups; and __fish_seen_subcommand_from schedule" -a "1h 6h 12h 1d 1w off"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-backups; and __fish_seen_subcommand_from schedule" -r -l keep -d "Automatic backups to keep"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug; and __wpdev_arg_n 3" -a "on off set"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug; and __fish_seen_subcommand_from set; and __wpdev_arg_n 4" -a "WP_DEBUG WP_DEBUG_LOG WP_DEBUG_DISPLAY SCRIPT_DEBUG SAVEQUERIES"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug; and __fish_seen_subcommand_from set; and __wpdev_arg_n 5" -a "true false"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug-log; and __wpdev_arg_n 3" -a "clear"
complete -c wpdev -f -n "__fish_seen_subcommand_from share; and __wpdev_arg_n 3" -a "on off"
complete -c wpdev -f -n "__fish_seen_subcommand_from share; and __fish_seen_subcommand_from on" -r -l for -d "How long: 30m, 2h, 1d"
complete -c wpdev -f -n "__fish_seen_subcommand_from share; and __fish_seen_subcommand_from on" -l public -d "Also at a temporary public https:// address"
complete -c wpdev -f -n "__fish_seen_subcommand_from share; and __fish_seen_subcommand_from on" -r -l password -d "Visitors sign in as preview"
complete -c wpdev -f -n "__fish_seen_subcommand_from share; and __fish_seen_subcommand_from on" -l admin -d "Include wp-admin and the login page"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug-log" -l follow -d "Keep showing new lines"
complete -c wpdev -f -n "__fish_seen_subcommand_from debug-log" -r -l lines -d "How many lines from the end"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-import" -l rewrite-urls -d "Re-point the dump's URLs to this site"
complete -c wpdev -f -n "__fish_seen_subcommand_from db-import" -l yes -d "Don't ask to confirm"
