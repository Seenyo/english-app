# Local model evaluation

This directory evaluates local Apple Silicon models against the existing
Codex-generated 10/10/5 placement assessment. It is intentionally isolated
from the application runtime: it does not update assessment records, learner
profiles, or question fixtures.

## Agents-A1 runtime

The model is served by `llama.cpp`, which uses Metal on Apple Silicon and
supports continuous batching. The default server configuration exposes three
parallel slots with a 16K context budget per slot.

```bash
./local-model-evaluation/start-server.sh
```

The first launch downloads approximately 5.2 GB of model weights into the
normal Hugging Face cache. Override defaults when needed:

```bash
LOCAL_LLM_PARALLEL=8 LOCAL_LLM_CONTEXT_PER_SLOT=32768 \
  ./local-model-evaluation/start-server.sh
```

## Gemma-4 OptiQ runtime

Gemma-4 uses an isolated Python 3.12 environment, MLX Metal kernels, OptiQ's
OpenAI-compatible server, and concurrent decoding. The optimized harness
generates one item per request with three requests in flight, then gives each
item to a blind semantic reviewer. Only rejected items are regenerated. This
avoids the quality drop and JSON drift observed near the end of ten-item
responses while preserving Metal batching. The setup deliberately installs the
exact `mlx-lm` Git revision validated by OptiQ because the unified Gemma-4 12B
model type is newer than the current PyPI build and unpinned `main` can
introduce server API drift.

```bash
./local-model-evaluation/setup-mlx.sh
./local-model-evaluation/start-mlx-server.sh
```

The first generation request downloads roughly 9 GB into the normal Hugging
Face cache and loads the model lazily. The server binds only to localhost.

Generate a quality-first 25-question set with Gemma-4:

```bash
LOCAL_LLM_PROTOCOL=openai-compatible \
LOCAL_LLM_ITEM_CONCURRENCY=3 \
LOCAL_LLM_GENERATION_THINKING=off \
LOCAL_LLM_VERIFIER_THINKING=off \
LOCAL_LLM_REPLACEMENT_THINKING=off \
node --import tsx local-model-evaluation/generate.ts \
  --strategy optimized --semantic-verification on \
  --max-semantic-repairs 4 --sets 1 --concurrency 1
```

The optimized non-thinking defaults are 1,536 generation/replacement tokens
and 1,024 verifier tokens. Longer limits did not improve a one-item JSON
response and allowed malformed repetitions to consume several minutes. The
model always generates the correct option at A; the host then moves it to the
balanced answer position in the immutable blueprint. This removes the model's
strong answer-position bias without exposing the final position during
generation.

The evaluation blueprint keeps the Codex category, CEFR, difficulty, and
answer-position distributions. It fixes target constructs before generation,
replaces two semantically repetitive targets, and supports target-specific
guidance where the location of the single blank is load-bearing. A production
version should source these targets and guidance from a curated vocabulary,
idiom, and grammar inventory rather than from the Codex baseline artifact.

Run the focused regression for the three constructs that exposed substitution
errors during manual review:

```bash
node --import tsx local-model-evaluation/focused-regression.ts
```

To reproduce the earlier whole-round, token-constrained diagnostic instead:

```bash
LOCAL_LLM_PROTOCOL=openai-compatible \
LOCAL_LLM_STRUCTURED_OUTPUT=native-schema \
node --import tsx local-model-evaluation/generate.ts --strategy legacy \
  --sets 1 --concurrency 3
```

For a larger legacy concurrent-decoding test:

```bash
LOCAL_LLM_PROTOCOL=openai-compatible \
node --import tsx local-model-evaluation/generate.ts --strategy legacy \
  --sets 2 --concurrency 4
```

## Reproduce the comparison

Export the active dry-run fixture's source assessment into the gitignored
artifact directory. This reads server-only Supabase data and deliberately
omits user id, email, Codex thread id, and access credentials.

```bash
node --env-file=.env.server --import tsx \
  local-model-evaluation/export-baseline.ts
```

The quality-first command above processes rounds sequentially so accepted
questions from earlier rounds can be reserved and excluded from later rounds.
Within each round, generation, review, and selective repair requests use the
configured item concurrency. Use the legacy commands only when reproducing the
original whole-round throughput measurements.

```bash
LOCAL_LLM_PROTOCOL=openai-compatible \
node --import tsx local-model-evaluation/generate.ts \
  --strategy optimized --semantic-verification on \
  --max-semantic-repairs 4 --sets 1 --concurrency 1
```

For a larger continuous-batching test, restart the server with four slots and
generate four independent sets while keeping four requests in flight:

```bash
LOCAL_LLM_PARALLEL=4 ./local-model-evaluation/start-server.sh
node --import tsx local-model-evaluation/generate.ts --sets 4 --concurrency 4
```

Create deterministic JSON and Markdown comparisons against the Codex baseline:

```bash
node --import tsx local-model-evaluation/compare.ts
```

All private prompts, answer keys, generated questions, and reports stay under
`local-model-evaluation/artifacts/`, which is ignored by Git.

## Evaluate future learning tasks

Generate ten contextual vocabulary/idiom questions, ten sentence-ordering
questions, and ten standalone reading-comprehension questions:

```bash
node --import tsx local-model-evaluation/learning-task-suite.ts
```

The harness generates one immutable blueprint at a time with three concurrent
requests, validates machine-readable structure, balances answer positions on
the host, and retries invalid JSON twice. A subset can be regenerated without
repeating accepted items:

```bash
node --import tsx local-model-evaluation/learning-task-suite.ts \
  --items quiz-1,ordering-4,reading-6
```

After manual review and selective regeneration, consolidate the newest valid
version of every blueprint into one private artifact:

```bash
node --import tsx local-model-evaluation/compile-learning-task-suite.ts
```

See [LEARNING_TASK_REVIEW.md](./LEARNING_TASK_REVIEW.md) for the qualitative
review, failure modes, and production recommendation.

## Observed results

Measured on the M5 Pro 64 GB development Mac on 2026-07-22. Aggregate token
rates include every repair response, so compare them together with repair
counts rather than as a standalone model benchmark.

| Model / run                | Concurrency | Valid questions | Wall time | Aggregate completion tok/s | Repairs |
| -------------------------- | ----------: | --------------: | --------: | -------------------------: | ------: |
| Agents-A1 4B Q8            |           3 |              25 |    59.2 s |                       85.8 |       0 |
| Gemma-4 12B OptiQ          |           3 |              25 |   190.3 s |                       39.1 |       1 |
| Agents-A1 4B Q8 load run   |           4 |              50 |   139.9 s |                       86.9 |       1 |
| Gemma-4 12B OptiQ load run |           4 |              50 |   356.4 s |                       53.6 |       5 |
| Gemma-4 optimized + review |           3 |              25 | 1,406.0 s |                       14.2 |       8 |

The original Gemma prompt produced at least five material content defects,
strong answer-position bias, repeated targets, and an inflated CEFR range. The
optimized run produced 25 schema-valid questions with the exact Codex category,
CEFR, and answer-position distributions. Its blind reviewer rejected ambiguous,
wrong-category, or malformed items and selectively regenerated them.

Automated acceptance is not sufficient by itself: manual review of the first
fully accepted set still found two malformed completed sentences and one
unnatural construct. Target-specific blueprint guidance corrected all three in
the focused regression (one, two, and one generation passes respectively).
This demonstrates an important production constraint: a generator and reviewer
based on the same local model share blind spots. Keep deterministic validation,
curated construct guidance, and a separately maintained human-reviewed
regression set even when the semantic reviewer reports 25/25 acceptance. See
the gitignored comparisons, raw attempts, verifier verdicts, and focused
regression artifacts under `artifacts/`.
