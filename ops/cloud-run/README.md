# Cloud Run AI bridge

The bridge runs as a single Cloud Run container and keeps Codex state in a
private Cloud Storage bucket. Runtime files are copied to local ephemeral
storage for normal POSIX behavior, then `auth.json` and resumable session files
are mirrored after every Codex turn.

## Deploy

Create a Google Cloud project with billing enabled, authenticate `gcloud`, and
run:

```sh
GCP_PROJECT_ID=your-project-id npm run cloud-run:deploy
```

The deployer creates:

- one Artifact Registry Docker repository
- one least-privilege runtime service account
- one private Cloud Storage bucket
- two Secret Manager secrets sourced from `.env.server` and
  `~/.codex/auth.json`
- one public Cloud Run endpoint protected at the application layer by the
  existing Supabase JWT validation, Google-account allowlist, and CORS policy

Cloud Run is configured with one vCPU, 2 GiB RAM, one concurrent request, one
maximum instance, zero minimum instances, and CPU available between requests
while an instance is alive. The durable Supabase analysis queue remains the
source of truth if an instance is stopped during background analysis.

## Verify

The deploy command checks `/health`. Then run a real authenticated assessment
from the frontend. Confirm that Round 1 creates a thread and Rounds 2 and 3
resume it before changing the GitHub `VITE_AI_BRIDGE_URL` repository variable.

The non-interactive production-container check generates 10/10/5 questions and
asserts that all three rounds use one resumable thread. The smoke job uses
ephemeral Codex state so it cannot overwrite sessions in the production state
bucket:

```sh
GCP_PROJECT_ID=your-project-id npm run cloud-run:smoke
```

## Rotate credentials

Run the deploy command again after either `.env.server` or
`~/.codex/auth.json` changes. It adds new Secret Manager versions without
printing their contents.
