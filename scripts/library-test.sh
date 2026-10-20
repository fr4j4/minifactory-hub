#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
envfile=data/library-test.env
if [ ! -f "$envfile" ]; then
  mkdir -p data
  umask 077
  {
    echo "LIBRARY_TEST_DB_PASSWORD=$(openssl rand -hex 24)"
    echo "LIBRARY_TEST_SESSION_SECRET=$(openssl rand -hex 48)"
  } > "$envfile"
fi
if ! rg -q '^LIBRARY_TEST_BROWSER_KEY=' "$envfile"; then
  umask 077
  echo "LIBRARY_TEST_BROWSER_KEY=$(openssl rand -hex 32)" >> "$envfile"
fi
if ! rg -q '^LIBRARY_TEST_ADMIN_PASSWORD=' "$envfile"; then
  umask 077
  test_password=$(openssl rand -hex 16)
  echo "LIBRARY_TEST_ADMIN_PASSWORD=$test_password" >> "$envfile"
  printf 'URL: http://localhost:3011\nEmail: biblioteca-test@minifactory.local\nPassword: %s\n' "$test_password" > data/library-test-access.txt
fi
case "${1:-up}" in
  up) docker compose --env-file "$envfile" -f docker-compose.library-test.yml up -d --build ;;
  status) docker compose --env-file "$envfile" -f docker-compose.library-test.yml ps ;;
  logs) docker compose --env-file "$envfile" -f docker-compose.library-test.yml logs --tail 60 app ;;
  stop) docker compose --env-file "$envfile" -f docker-compose.library-test.yml stop ;;
  *) echo 'Usage: bash scripts/library-test.sh [up|status|logs|stop]' >&2; exit 1 ;;
esac
