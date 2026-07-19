# everyday — personal English study

A private, adaptive English-learning web app. Google accounts represent the
owner's test personas; Codex generates placement questions through the owner's
ChatGPT Plus/Pro login. No OpenAI API key is used.

## What is implemented

- Google OAuth with Supabase
- Owner-only Google account allowlist on the local AI bridge
- Three-round adaptive placement test: 10 + 10 + 5 questions
- Vocabulary, idiom, and grammar sentence-completion questions
- Four choices plus “I don't know”; selection is saved immediately
- Codex SDK thread resume between rounds
- JSON Schema output plus domain validation
- Automatic same-thread repair when Codex output cannot be parsed
- Server-only answer keys and deterministic scoring
- Per-persona data persistence and RLS in Supabase
- Responsive, keyboard-accessible React UI
- GitHub Pages deployment for the static frontend
- Local-only dry-run mode with fixed questions and isolated results
- Asynchronous post-assessment analysis in the same Codex thread
- One versioned learner persona with user-editable goals and AI/system-owned fields
- Immutable Japanese feedback reports with all 25 answers

## Architecture

```text
GitHub Pages / Vite dev server
        │ Supabase access token
        ▼
Personal AI bridge (127.0.0.1:8787)
        ├── Supabase: attempts, answers, persona versions, reports, jobs
        └── Codex SDK: one resumable thread per learning feature
```

The AI bridge inherits only Codex's login-related process environment. Supabase
secrets are deliberately removed before the Codex child process starts. Codex
runs with `--ignore-user-config` from an isolated temporary working directory,
so user-configured MCP servers and project settings are not available to
assessment prompts.

## Run locally

Complete [`SETUP.md`](./SETUP.md), then use two terminals:

```bash
npm run dev
npm run dev:ai
```

Open <http://localhost:5173>. The AI bridge binds only to `127.0.0.1`.

To run the fixed-question debug flow, start the bridge with:

```bash
npm run dev:ai:dry-run
```

The bridge is exclusively live or dry-run until restarted. There is no mode
switch in the browser.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run ai:smoke  # consumes one Codex turn; prints metadata only
```

The deploy workflow runs lint, type checking, tests, and the production build
before GitHub Pages deployment.

## Important paths

- [`shared/assessment/contracts.ts`](./shared/assessment/contracts.ts) — shared request/state contracts
- [`server/assessment/generator.ts`](./server/assessment/generator.ts) — Codex generation and repair loop
- [`server/assessment/repository.ts`](./server/assessment/repository.ts) — server-only persistence
- [`supabase/migrations/202607180001_assessment.sql`](./supabase/migrations/202607180001_assessment.sql) — schema and access policy
- [`supabase/migrations/202607180002_dry_run.sql`](./supabase/migrations/202607180002_dry_run.sql) — isolated dry-run schema
- [`supabase/migrations/202607180003_learning_documents.sql`](./supabase/migrations/202607180003_learning_documents.sql) — Persona, reports, agent threads, and analysis jobs
- [`supabase/migrations/202607180004_atomic_persona_bootstrap.sql`](./supabase/migrations/202607180004_atomic_persona_bootstrap.sql) — atomic Persona creation and revision repair
- [`src/features/assessment`](./src/features/assessment) — browser state and assessment UI
- [`server/learning`](./server/learning) — post-assessment analysis, job processing, and document persistence
- [`src/features/learning`](./src/features/learning) — Persona and feedback browser state
