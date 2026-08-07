#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_id="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID.}"
readonly region="${GCP_REGION:-us-central1}"
readonly service="${GCP_SERVICE:-english-ai-bridge}"
readonly job="${GCP_SMOKE_JOB:-english-ai-bridge-smoke}"
readonly runtime_account_name="${GCP_RUNTIME_ACCOUNT:-english-ai-bridge}"
readonly runtime_account="${runtime_account_name}@${project_id}.iam.gserviceaccount.com"
readonly state_bucket="${GCP_CODEX_STATE_BUCKET:-${project_id}-english-ai-codex-state}"
readonly server_env_secret="${GCP_SERVER_ENV_SECRET:-english-ai-server-env}"
readonly codex_auth_secret="${GCP_CODEX_AUTH_SECRET:-english-ai-codex-auth}"

image="$(
  gcloud run services describe "$service" \
    --project "$project_id" \
    --region "$region" \
    --format='value(spec.template.spec.containers[0].image)'
)"
readonly image

gcloud run jobs deploy "$job" \
  --project "$project_id" \
  --region "$region" \
  --image "$image" \
  --service-account "$runtime_account" \
  --execution-environment gen2 \
  --cpu 1 \
  --memory 2Gi \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 0 \
  --task-timeout 3600 \
  --command npm \
  --args run,ai:smoke:cloud \
  --set-env-vars 'CODEX_HOME=/tmp/english-study-codex-home,CODEX_STATE_MIRROR_DIR=/mnt/codex-state,CODEX_AUTH_SEED_FILE=/var/secrets/codex/auth.json' \
  --set-secrets "/var/secrets/server/.env.server=${server_env_secret}:latest,/var/secrets/codex/auth.json=${codex_auth_secret}:latest" \
  --add-volume "name=codex-state,type=cloud-storage,bucket=${state_bucket},mount-options=uid=1000;gid=1000" \
  --add-volume-mount 'volume=codex-state,mount-path=/mnt/codex-state'

gcloud run jobs execute "$job" \
  --project "$project_id" \
  --region "$region" \
  --wait
