#!/bin/sh
# Opens <dir> in a terminal editor, in a new terminal window:
#   edit-in-terminal.sh <dir> <editor>
# Runs on the desktop, as you: `wpdev open <site> --editor=nvim` starts it
# directly from the host, or -- from the dashboard -- asks your session's
# systemd to (see cmd_open in wpdev). The editor runs through your login
# shell, so it's found on your own PATH (~/.local/bin, a version manager);
# if it isn't, the window says so and waits instead of vanishing.
#
# The terminal is $TERMINAL if set, otherwise the first one installed of a
# common few -- each takes "run this in that directory" differently.
set -eu
dir="$1"
editor="$2"
cd "$dir"

shell="$(getent passwd "$(id -un)" | cut -d: -f7)"
[ -x "${shell:-}" ] || shell=/bin/sh
# Your login shell only runs "<editor> .", which reads the same in sh, bash,
# zsh and fish; the keep-the-window-open part is sh's. <editor> is one wpdev
# allows (OPEN_EDITORS), so it's safe in that string.
set -- sh -c '"$1" -lc "$2 ." || { echo; echo "Press Enter to close."; read -r _; }' sh "$shell" "$editor"

for term in ${TERMINAL:-} kitty alacritty wezterm foot konsole gnome-terminal xfce4-terminal x-terminal-emulator xterm; do
    command -v "$term" >/dev/null 2>&1 || continue
    case "$(basename "$term")" in
        kitty) exec kitty --directory "$dir" "$@" ;;
        alacritty) exec alacritty --working-directory "$dir" -e "$@" ;;
        wezterm) exec wezterm start --cwd "$dir" -- "$@" ;;
        foot) exec foot -D "$dir" "$@" ;;
        konsole) exec konsole --workdir "$dir" -e "$@" ;;
        gnome-terminal) exec gnome-terminal --working-directory="$dir" --wait -- "$@" ;;
        xfce4-terminal) exec xfce4-terminal --working-directory="$dir" -x "$@" ;;
        *) exec "$term" -e "$@" ;;
    esac
done
echo "No terminal found to open ${editor} in; set TERMINAL." >&2
exit 1
