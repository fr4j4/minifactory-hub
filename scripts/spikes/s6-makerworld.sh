#!/usr/bin/env bash
# S6: ejecutar FUERA del sandbox (aquí makerworld.com está bloqueado por la política de red).
# Uso: scripts/spikes/s6-makerworld.sh <id-modelo> [token]
ID=${1:-1}; TOKEN=${2:-}
UA='Mozilla/5.0'
for u in "https://makerworld.com/api/v1/design-service/design/$ID" "https://makerworld.com/en/models/$ID" "https://makerworld.com/robots.txt"; do
  echo "== $u"; curl -sS -m 20 -A "$UA" ${TOKEN:+-H "Authorization: Bearer $TOKEN"} -o /dev/stdout -w '\n%{http_code} %{content_type}\n' "$u" | tail -c 600
done
