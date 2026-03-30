#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/frontier}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET_FILE="$BACKUP_DIR/frontier-$TIMESTAMP.sql.gz"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set before running backup-postgres.sh" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
pg_dump "$DATABASE_URL" | gzip > "$TARGET_FILE"
find "$BACKUP_DIR" -type f -name 'frontier-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup written to $TARGET_FILE"
