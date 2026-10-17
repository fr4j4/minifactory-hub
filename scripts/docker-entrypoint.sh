#!/bin/sh
# Arranca como root solo para dejar /data al usuario app (los volúmenes de versiones anteriores son de root) y luego baja privilegios.
set -e
if [ "$(id -u)" = 0 ]; then
  [ "$(stat -c %U /data)" = app ] || chown -R app:app /data
  exec env HOME=/home/app setpriv --reuid=app --regid=app --init-groups "$@"
fi
exec "$@"
