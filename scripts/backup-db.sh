#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required (PostgreSQL client tools)." >&2; exit 1; }
out="${1:-trademind-backup-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$out"
echo "Backup written to $out"
echo "Restore: pg_restore --clean --if-exists --no-owner --no-privileges --dbname \"\$DATABASE_URL\" \"$out\""
