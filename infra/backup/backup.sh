#!/bin/sh
# Nightly backup (S3-A1): stop-less SQLite snapshot of the n8n volume +
# workflow JSON export, tarred, pushed off-box. 14-day retention.
# Cron (root on VPS):  15 3 * * *  /opt/wgc/infra/backup/backup.sh
# OFFSITE_DEST examples: rclone remote ("s3:wgc-backups") or "user@host:path".
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
OUT="/var/backups/wgc"
OFFSITE_DEST="${OFFSITE_DEST:?set OFFSITE_DEST (rclone remote or scp target)}"
RETENTION_DAYS=14

mkdir -p "$OUT"

# Consistent SQLite copy without stopping n8n (.backup uses the online API).
docker compose -f /opt/wgc/infra/docker-compose.yml exec -T n8n \
  sh -c 'sqlite3 /home/node/.n8n/database.sqlite ".backup /tmp/db-snapshot.sqlite"'
docker compose -f /opt/wgc/infra/docker-compose.yml cp n8n:/tmp/db-snapshot.sqlite "$WORK/database.sqlite"

# Workflow definitions as importable JSON (belt to the DB's suspenders).
docker compose -f /opt/wgc/infra/docker-compose.yml exec -T n8n \
  n8n export:workflow --all --output=/tmp/workflows-export.json
docker compose -f /opt/wgc/infra/docker-compose.yml cp n8n:/tmp/workflows-export.json "$WORK/workflows-export.json"

tar -czf "$OUT/wgc-n8n-$STAMP.tar.gz" -C "$WORK" .
rm -rf "$WORK"

# Off-box copy: rclone if available, else scp.
if command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT/wgc-n8n-$STAMP.tar.gz" "$OFFSITE_DEST"
else
  scp -q "$OUT/wgc-n8n-$STAMP.tar.gz" "$OFFSITE_DEST"
fi

find "$OUT" -name 'wgc-n8n-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
echo "backup ok: wgc-n8n-$STAMP.tar.gz"
