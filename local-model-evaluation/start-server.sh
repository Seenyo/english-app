#!/usr/bin/env bash
set -euo pipefail

model="${LOCAL_LLM_MODEL:-InternScience/Agents-A1-4B-Q8_0-GGUF:Q8_0}"
port="${LOCAL_LLM_PORT:-18080}"
parallel="${LOCAL_LLM_PARALLEL:-3}"
context_per_slot="${LOCAL_LLM_CONTEXT_PER_SLOT:-16384}"
context="$((context_per_slot * parallel))"

if command -v llama-server >/dev/null 2>&1; then
  exec llama-server \
    -hf "$model" \
    --host 127.0.0.1 \
    --port "$port" \
    --ctx-size "$context" \
    --parallel "$parallel" \
    --n-gpu-layers 99 \
    --cont-batching \
    --jinja \
    --reasoning off \
    --reasoning-budget 0 \
    --skip-chat-parsing
fi

if command -v llama >/dev/null 2>&1; then
  exec llama serve \
    -hf "$model" \
    --host 127.0.0.1 \
    --port "$port" \
    --ctx-size "$context" \
    --parallel "$parallel" \
    --n-gpu-layers 99 \
    --cont-batching \
    --jinja \
    --reasoning off \
    --reasoning-budget 0 \
    --skip-chat-parsing
fi

echo "llama.cpp is not installed. Run: brew install llama.cpp" >&2
exit 1
