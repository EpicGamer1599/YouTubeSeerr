#!/bin/sh
set -eu
umask 022
if [ "$(id -u)" = "0" ]; then
  # Change only volume roots; never recursively chown an existing media library.
  mkdir -p /config /downloads /media/youtube
  chown "${PUID:-1000}:${PGID:-1000}" /config /downloads /media/youtube
  chmod 700 /config
  exec gosu "${PUID:-1000}:${PGID:-1000}" "$@"
fi
exec "$@"
