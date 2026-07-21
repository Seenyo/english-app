#!/usr/bin/env bash
set -Eeuo pipefail

readonly app_dir="${ENGLISH_AI_APP_DIR:-/opt/english-app}"
readonly app_user="${ENGLISH_AI_USER:-english-ai}"
readonly app_group="${ENGLISH_AI_GROUP:-english-ai}"
readonly app_home="${ENGLISH_AI_HOME:-/var/lib/english-ai}"
readonly app_service="${ENGLISH_AI_SERVICE:-english-ai.service}"
readonly target_ref="${ENGLISH_AI_TARGET_REF:-origin/main}"
readonly health_url="${ENGLISH_AI_HEALTH_URL:-http://127.0.0.1:8787/health}"
readonly lock_file="${ENGLISH_AI_DEPLOY_LOCK:-/run/lock/english-ai-deploy.lock}"
readonly staging_root="${ENGLISH_AI_STAGING_ROOT:-${app_home}/deploy-staging}"

previous_sha=""
staging_dir=""
rollback_armed=0

log() {
  printf '[english-ai-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  return 1
}

run_as_app() {
  /usr/sbin/runuser -u "$app_user" -- /usr/bin/env HOME="$app_home" "$@"
}

run_as_app_in() {
  local directory="$1"
  shift
  /usr/sbin/runuser -u "$app_user" -- \
    /usr/bin/env -C "$directory" HOME="$app_home" "$@"
}

git_as_app() {
  run_as_app git -C "$app_dir" "$@"
}

wait_for_health() {
  local attempt=0
  while ((attempt < 30)); do
    ((attempt += 1))
    if curl --fail --silent --show-error --max-time 3 "$health_url" \
      | grep --quiet '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup_staging() {
  if [[ -n "$staging_dir" ]]; then
    git_as_app worktree remove --force "$staging_dir" >/dev/null 2>&1 || true
  fi
  git_as_app worktree prune >/dev/null 2>&1 || true
}

sync_automation_files() {
  local source_dir="${app_dir}/ops/oracle"
  [[ -f "${source_dir}/deploy-bridge.sh" ]] || return 0
  install -o root -g root -m 0755 \
    "${source_dir}/deploy-bridge.sh" /usr/local/sbin/deploy-english-ai
  install -o root -g root -m 0644 \
    "${source_dir}/english-ai-deploy.service" \
    /etc/systemd/system/english-ai-deploy.service
  install -o root -g root -m 0644 \
    "${source_dir}/english-ai-deploy.timer" \
    /etc/systemd/system/english-ai-deploy.timer
  systemctl daemon-reload
  systemctl enable --now english-ai-deploy.timer >/dev/null
}

rollback_live() {
  local rollback_status=0
  log "Rolling back to ${previous_sha}."
  git_as_app reset --hard "$previous_sha" || rollback_status=1
  run_as_app_in "$app_dir" npm ci || rollback_status=1
  systemctl restart "$app_service" || rollback_status=1
  if ! wait_for_health; then
    log "CRITICAL: rollback completed but the bridge health check still fails."
    rollback_status=1
  else
    log "Rollback health check passed."
  fi
  rollback_armed=0
  return "$rollback_status"
}

on_exit() {
  local status=$?
  trap - EXIT
  if ((status != 0 && rollback_armed == 1)); then
    rollback_live || true
  fi
  cleanup_staging
  exit "$status"
}
trap on_exit EXIT

if ((EUID != 0)); then
  fail 'run this deployment command as root'
  exit 1
fi

for command in curl flock git grep install npm systemctl; do
  command -v "$command" >/dev/null || {
    fail "required command is missing: ${command}"
    exit 1
  }
done
id "$app_user" >/dev/null 2>&1 || {
  fail "deployment user does not exist: ${app_user}"
  exit 1
}
[[ -d "${app_dir}/.git" ]] || {
  fail "application checkout is missing: ${app_dir}"
  exit 1
}

exec 9>"$lock_file"
if ! flock --nonblock 9; then
  log 'Another deployment is already running; skipping this timer tick.'
  exit 0
fi

if [[ -n "$(git_as_app status --porcelain)" ]]; then
  fail 'the deployment checkout has local changes; refusing to overwrite them'
  exit 1
fi

log 'Fetching origin/main.'
git_as_app fetch --prune origin main
previous_sha="$(git_as_app rev-parse HEAD)"
readonly previous_sha
target_sha="$(git_as_app rev-parse "${target_ref}^{commit}")"
readonly target_sha

if [[ "$previous_sha" == "$target_sha" ]]; then
  log "Already at ${target_sha}; nothing to deploy."
  exit 0
fi
if ! git_as_app merge-base --is-ancestor "$previous_sha" "$target_sha"; then
  fail "${target_ref} is not a fast-forward from ${previous_sha}"
  exit 1
fi

install -d -o "$app_user" -g "$app_group" -m 0750 "$staging_root"
staging_dir="${staging_root}/${target_sha}"
if [[ -e "$staging_dir" ]]; then
  fail "staging path already exists: ${staging_dir}"
  exit 1
fi

log "Validating ${target_sha} in an isolated worktree."
git_as_app worktree add --detach "$staging_dir" "$target_sha" >/dev/null
run_as_app_in "$staging_dir" npm ci
run_as_app_in "$staging_dir" npm run typecheck
run_as_app_in "$staging_dir" npm test
run_as_app_in "$staging_dir" npm run security:client-boundary

mapfile -t changed_files < <(
  git_as_app diff --name-only "$previous_sha" "$target_sha"
)
bridge_changed=0
migrations_changed=0
for changed_file in "${changed_files[@]}"; do
  case "$changed_file" in
    server/* | shared/* | package.json | package-lock.json | .nvmrc | tsconfig*.json)
      bridge_changed=1
      ;;
    supabase/migrations/*)
      migrations_changed=1
      ;;
  esac
done

if ((migrations_changed == 1)); then
  log 'NOTICE: this revision contains Supabase migrations; they are not applied automatically.'
fi

if ((bridge_changed == 0)); then
  log 'No bridge runtime files changed; fast-forwarding without a restart.'
  git_as_app merge --ff-only "$target_sha"
  sync_automation_files
  log "Checkout updated to ${target_sha}."
  exit 0
fi

log 'Bridge runtime changed; activating the validated revision.'
rollback_armed=1
systemctl stop "$app_service"
git_as_app merge --ff-only "$target_sha"
run_as_app_in "$app_dir" npm ci
sync_automation_files
systemctl restart "$app_service"
if ! wait_for_health; then
  fail "health check failed after deploying ${target_sha}"
  exit 1
fi
rollback_armed=0
log "Deployment ${target_sha} is healthy."
