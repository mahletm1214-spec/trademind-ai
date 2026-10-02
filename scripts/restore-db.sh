#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?Usage: DATABASE_URL=... ./scripts/restore-db.sh backup.dump}"
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required (PostgreSQL client tools)." >&2; exit 1; }
echo "Restoring $1 into DATABASE_URL. Existing objects may be replaced."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" "$1"
echo "Restore completed"
