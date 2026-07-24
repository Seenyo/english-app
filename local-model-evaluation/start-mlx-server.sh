#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
optiq="$script_dir/.venv/bin/optiq"
model="${MLX_LLM_MODEL:-mlx-community/gemma-4-12B-it-OptiQ-4bit}"
port="${MLX_LLM_PORT:-18081}"
max_tokens="${MLX_LLM_MAX_TOKENS:-8192}"
temperature="${MLX_LLM_TEMPERATURE:-0.7}"
top_p="${MLX_LLM_TOP_P:-0.9}"
top_k="${MLX_LLM_TOP_K:-64}"

export HF_HUB_DISABLE_PROGRESS_BARS=1
export HF_XET_HIGH_PERFORMANCE=1

if [[ ! -x "$optiq" ]]; then
  echo "The isolated MLX environment is missing. Run: ./local-model-evaluation/setup-mlx.sh" >&2
  exit 1
fi

# Bind only to loopback. fp16 KV is the simplest and highest-fidelity baseline;
# the model itself remains mixed-precision and Metal-backed through MLX.
exec "$optiq" serve \
  --model "$model" \
  --host 127.0.0.1 \
  --port "$port" \
  --max-tokens "$max_tokens" \
  --temp "$temperature" \
  --top-p "$top_p" \
  --top-k "$top_k" \
  --no-anthropic
