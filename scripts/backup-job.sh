#!/bin/sh
# Cloud Run Job entrypoint for a daily Scholar data backup.
# Status: documented, not deployed. Ashley runs deploy/cloud-run-backup-job when ready.
set -eu

ROOT="${BACKUP_ROOT:-/mnt/scholar-data/backups}"
export BACKUP_ROOT="$ROOT"
export BACKUP_KEEP="${BACKUP_KEEP:-30}"

if [ -f dist/data-backup.cjs ]; then
  node dist/data-backup.cjs daily "$ROOT" | tee /tmp/scholar-backup-result.json
elif [ -f scripts/data-backup.ts ]; then
  npx tsx scripts/data-backup.ts daily "$ROOT" | tee /tmp/scholar-backup-result.json
else
  echo "data-backup CLI not found (dist/data-backup.cjs or scripts/data-backup.ts)." >&2
  exit 1
fi

# The daily command already ran verify and pruned to BACKUP_KEEP. Exit non-zero if JSON is missing.
DIR=$(node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('/tmp/scholar-backup-result.json','utf8')); if(!j.verified||!j.dir) process.exit(2); process.stdout.write(j.dir);")

if [ -n "${BACKUP_GCS_URI:-}" ]; then
  if command -v gcloud >/dev/null 2>&1; then
    dest="${BACKUP_GCS_URI%/}/$(basename "$DIR")"
    echo "Copying $DIR to $dest"
    gcloud storage cp -r "$DIR" "$dest"
  else
    echo "BACKUP_GCS_URI is set but gcloud is not in this image; off-site copy was not done." >&2
    exit 1
  fi
fi
