#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
readonly app_user="${ENGLISH_AI_USER:-english-ai}"
readonly app_group="${ENGLISH_AI_GROUP:-english-ai}"
readonly app_home="${ENGLISH_AI_HOME:-/var/lib/english-ai}"

if ((EUID != 0)); then
  printf 'Run this installer as root.\n' >&2
  exit 1
fi

id "$app_user" >/dev/null 2>&1
systemctl cat english-ai.service >/dev/null

install -d -o "$app_user" -g "$app_group" -m 0750 \
  "${app_home}/deploy-staging"
install -o root -g root -m 0755 \
  "${script_dir}/deploy-bridge.sh" /usr/local/sbin/deploy-english-ai
install -o root -g root -m 0644 \
  "${script_dir}/english-ai-deploy.service" \
  /etc/systemd/system/english-ai-deploy.service
install -o root -g root -m 0644 \
  "${script_dir}/english-ai-deploy.timer" \
  /etc/systemd/system/english-ai-deploy.timer

systemctl daemon-reload
systemctl enable --now english-ai-deploy.timer
systemctl start english-ai-deploy.service

printf 'Oracle AI Bridge deployment automation is installed.\n'
