#!/bin/sh
# Create or update the Cloud Run Job and Cloud Scheduler trigger for daily backups.
# Dry-run by default (prints the commands). Pass --apply to run them.
# Status: documented, not deployed. Fill in the variables, then Ashley runs this.
set -eu

APPLY=0
if [ "${1:-}" = "--apply" ]; then
  APPLY=1
  shift
fi

PROJECT="${PROJECT:?set PROJECT}"
REGION="${REGION:?set REGION}"
IMAGE="${IMAGE:?set IMAGE (the same image as the Scholar Cloud Run service)}"
NETWORK="${NETWORK:?set NETWORK}"
SUBNET="${SUBNET:?set SUBNET}"
FILESTORE_IP="${FILESTORE_IP:?set FILESTORE_IP}"
FILESTORE_SHARE="${FILESTORE_SHARE:-/share1}"
JOB="${JOB:-scholar-data-backup}"
SCHEDULER_JOB="${SCHEDULER_JOB:-scholar-data-backup-daily}"
SCHEDULE="${SCHEDULE:-0 7 * * *}"
TIME_ZONE="${TIME_ZONE:-America/New_York}"
# Service account that Cloud Scheduler uses to start the job (needs roles/run.invoker on the job).
SCHEDULER_SA="${SCHEDULER_SA:?set SCHEDULER_SA (user@PROJECT.iam.gserviceaccount.com)}"
# Optional: gs://bucket/scholar-backups  — the job copies each verified folder here if set.
BACKUP_GCS_URI="${BACKUP_GCS_URI:-}"

ENV_VARS="SCHOLAR_DATA_DIR=/mnt/scholar-data,BACKUP_ROOT=/mnt/scholar-data/backups,BACKUP_KEEP=30"
if [ -n "$BACKUP_GCS_URI" ]; then
  ENV_VARS="${ENV_VARS},BACKUP_GCS_URI=${BACKUP_GCS_URI}"
fi

JOB_CMD="gcloud run jobs deploy ${JOB} \
  --project=${PROJECT} \
  --region=${REGION} \
  --image=${IMAGE} \
  --command=sh \
  --args=scripts/backup-job.sh \
  --set-env-vars=${ENV_VARS} \
  --execution-environment=gen2 \
  --network=${NETWORK} \
  --subnet=${SUBNET} \
  --add-volume=name=scholar-data,type=nfs,location=${FILESTORE_IP}:${FILESTORE_SHARE} \
  --add-volume-mount=volume=scholar-data,mount-path=/mnt/scholar-data \
  --tasks=1 \
  --max-retries=1 \
  --task-timeout=30m \
  --memory=1Gi"

SCHED_CMD="gcloud scheduler jobs update http ${SCHEDULER_JOB} \
  --project=${PROJECT} \
  --location=${REGION} \
  --schedule=${SCHEDULE} \
  --time-zone=${TIME_ZONE} \
  --uri=https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/${JOB}:run \
  --http-method=POST \
  --oauth-service-account-email=${SCHEDULER_SA} \
  --oauth-token-audience=https://run.googleapis.com/"

CREATE_SCHED_CMD="gcloud scheduler jobs create http ${SCHEDULER_JOB} \
  --project=${PROJECT} \
  --location=${REGION} \
  --schedule=${SCHEDULE} \
  --time-zone=${TIME_ZONE} \
  --uri=https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/${JOB}:run \
  --http-method=POST \
  --oauth-service-account-email=${SCHEDULER_SA} \
  --oauth-token-audience=https://run.googleapis.com/"

echo "=== Cloud Run Job (daily backup + verify + prune to 30) ==="
echo "$JOB_CMD"
echo
echo "=== Cloud Scheduler (07:00 America/New_York) ==="
echo "# create if it does not exist:"
echo "$CREATE_SCHED_CMD"
echo "# or update:"
echo "$SCHED_CMD"

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "Dry run only. Nothing was deployed. Re-run with --apply after reviewing the commands."
  exit 0
fi

echo
echo "Applying (--apply)..."
eval "$JOB_CMD"
if gcloud scheduler jobs describe "$SCHEDULER_JOB" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  eval "$SCHED_CMD"
else
  eval "$CREATE_SCHED_CMD"
fi
echo "Done. Check: gcloud run jobs executions list --job=${JOB} --region=${REGION} --project=${PROJECT}"
