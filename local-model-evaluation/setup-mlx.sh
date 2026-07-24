#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venv="$script_dir/.venv"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install it with: brew install uv" >&2
  exit 1
fi

if [[ ! -x "$venv/bin/python" ]]; then
  uv venv --python 3.12 "$venv"
fi
uv pip install --python "$venv/bin/python" --upgrade \
  mlx-optiq \
  "mlx-lm @ git+https://github.com/ml-explore/mlx-lm.git@df1d3f3c9a7aae402dcbb8f41d4c36bcc13a50ae"

"$venv/bin/python" -c 'import mlx; import optiq; import mlx_lm; print("MLX/OptiQ environment is ready")'
