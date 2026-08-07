#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_id="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID to an existing Google Cloud project.}"
readonly region="${GCP_REGION:-us-central1}"
readonly service="${GCP_SERVICE:-english-ai-bridge}"
readonly repository="${GCP_ARTIFACT_REPOSITORY:-english-ai}"
readonly runtime_account_name="${GCP_RUNTIME_ACCOUNT:-english-ai-bridge}"
readonly state_bucket="${GCP_CODEX_STATE_BUCKET:-${project_id}-english-ai-codex-state}"
readonly server_env_file="${ENGLISH_AI_SERVER_ENV_FILE:-.env.server}"
readonly codex_auth_file="${CODEX_AUTH_FILE:-${HOME}/.codex/auth.json}"
readonly server_env_secret="${GCP_SERVER_ENV_SECRET:-english-ai-server-env}"
readonly codex_auth_secret="${GCP_CODEX_AUTH_SECRET:-english-ai-codex-auth}"
readonly image="${region}-docker.pkg.dev/${project_id}/${repository}/${service}:$(git rev-parse --short=12 HEAD)"
readonly runtime_account="${runtime_account_name}@${project_id}.iam.gserviceaccount.com"

log() {
  printf '[cloud-run-deploy] %s\n' "$*"
}

require_file() {
  [[ -f "$1" ]] || {
    printf 'Required file is missing: %s\n' "$1" >&2
    exit 1
  }
}

upsert_secret() {
  local name="$1"
  local source="$2"
  if ! gcloud secrets describe "$name" --project "$project_id" >/dev/null 2>&1; then
    gcloud secrets create "$name" \
      --project "$project_id" \
      --replication-policy=automatic
  fi
  gcloud secrets versions add "$name" \
    --project "$project_id" \
    --data-file="$source" >/dev/null

  local versions=()
  local version
  while IFS= read -r version; do
    versions+=("$version")
  done < <(
    gcloud secrets versions list "$name" \
      --project "$project_id" \
      --filter='state=enabled' \
      --sort-by='~createTime' \
      --format='value(name)'
  )
  local index
  for ((index = 2; index < ${#versions[@]}; index += 1)); do
    gcloud secrets versions destroy "${versions[$index]}" \
      --project "$project_id" \
      --secret "$name" \
      --quiet >/dev/null
  done
}

retry() {
  local attempt=1
  local maximum_attempts=12
  until "$@"; do
    if ((attempt >= maximum_attempts)); then
      return 1
    fi
    log "IAM propagation is still pending; retrying (${attempt}/${maximum_attempts})."
    attempt=$((attempt + 1))
    sleep 5
  done
}

require_file "$server_env_file"
require_file "$codex_auth_file"
command -v gcloud >/dev/null
command -v git >/dev/null

gcloud config set project "$project_id" >/dev/null

log 'Enabling required Google Cloud APIs.'
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project "$project_id"

if ! gcloud artifacts repositories describe "$repository" \
  --project "$project_id" \
  --location "$region" >/dev/null 2>&1; then
  log 'Creating Artifact Registry repository.'
  gcloud artifacts repositories create "$repository" \
    --project "$project_id" \
    --location "$region" \
    --repository-format=docker
fi

if ! gcloud iam service-accounts describe "$runtime_account" \
  --project "$project_id" >/dev/null 2>&1; then
  log 'Creating the bridge runtime service account.'
  gcloud iam service-accounts create "$runtime_account_name" \
    --project "$project_id" \
    --display-name='English AI bridge'
fi

if ! gcloud storage buckets describe "gs://${state_bucket}" \
  --project "$project_id" >/dev/null 2>&1; then
  log 'Creating the private Codex state bucket.'
  gcloud storage buckets create "gs://${state_bucket}" \
    --project "$project_id" \
    --location "$region" \
    --uniform-bucket-level-access \
    --public-access-prevention
  gcloud storage buckets update "gs://${state_bucket}" \
    --clear-soft-delete
fi

retry gcloud storage buckets add-iam-policy-binding "gs://${state_bucket}" \
  --member "serviceAccount:${runtime_account}" \
  --role roles/storage.objectUser >/dev/null

log 'Updating server configuration and Codex login secrets.'
upsert_secret "$server_env_secret" "$server_env_file"
upsert_secret "$codex_auth_secret" "$codex_auth_file"
for secret in "$server_env_secret" "$codex_auth_secret"; do
  retry gcloud secrets add-iam-policy-binding "$secret" \
    --project "$project_id" \
    --member "serviceAccount:${runtime_account}" \
    --role roles/secretmanager.secretAccessor >/dev/null
done

log 'Building the bridge container in Cloud Build.'
gcloud builds submit \
  --project "$project_id" \
  --region "$region" \
  --tag "$image" \
  .

log 'Deploying one serialized Cloud Run instance.'
gcloud run deploy "$service" \
  --project "$project_id" \
  --region "$region" \
  --image "$image" \
  --service-account "$runtime_account" \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --port 8080 \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 3600 \
  --no-cpu-throttling \
  --set-env-vars 'AI_BRIDGE_HOST=0.0.0.0,CODEX_HOME=/tmp/english-study-codex-home,CODEX_STATE_MIRROR_DIR=/mnt/codex-state,CODEX_AUTH_SEED_FILE=/var/secrets/codex/auth.json' \
  --set-secrets "/var/secrets/server/.env.server=${server_env_secret}:latest,/var/secrets/codex/auth.json=${codex_auth_secret}:latest" \
  --add-volume "name=codex-state,type=cloud-storage,bucket=${state_bucket},mount-options=uid=1000;gid=1000" \
  --add-volume-mount 'volume=codex-state,mount-path=/mnt/codex-state'

service_url="$(
  gcloud run services describe "$service" \
    --project "$project_id" \
    --region "$region" \
    --format='value(status.url)'
)"
readonly service_url

log 'Checking the deployed health endpoint.'
curl --fail --silent --show-error --retry 6 --retry-all-errors \
  --retry-delay 5 "${service_url}/health"
printf '\n%s\n' "$service_url"
