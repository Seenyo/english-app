# Setup — Supabase, Google login, and the personal Codex bridge

The frontend uses public Supabase values. The local AI bridge additionally uses
a server-only Supabase secret so answer keys never reach the browser.

## 1. Frontend environment

Copy `.env.example` to `.env` and fill in:

```dotenv
VITE_SUPABASE_URL=https://zqmscunpbzungopdegym.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY
VITE_AI_BRIDGE_URL=http://127.0.0.1:8787
```

These values are public. Do not put a secret/service-role key in any `VITE_`
variable.

## 2. Google OAuth

In Google Cloud, create a Web OAuth client with:

- Redirect URI:
  `https://zqmscunpbzungopdegym.supabase.co/auth/v1/callback`
- JavaScript origins:
  `https://seenyo.github.io` and `http://localhost:5173`

In Supabase:

1. Authentication → Providers → Google: enable it and add the client ID/secret.
2. Authentication → URL Configuration:
   - Site URL: `https://seenyo.github.io/english-app/`
   - Redirect URLs:
     - `https://seenyo.github.io/english-app/**`
     - `http://localhost:5173/**`

## 3. Apply the database migrations

Install the pinned Supabase CLI, authenticate, and link this checkout to the
project. Do not apply migration files through the remote SQL Editor: direct
remote changes bypass migration history and make later pushes unsafe.

```bash
npm install
npm run supabase -- login
npm run supabase -- link --project-ref zqmscunpbzungopdegym
```

The repository applies these files in timestamp order:

[`supabase/migrations/20260715053827_create_notes_table_with_rls.sql`](./supabase/migrations/20260715053827_create_notes_table_with_rls.sql)

[`supabase/migrations/202607180001_assessment.sql`](./supabase/migrations/202607180001_assessment.sql)

[`supabase/migrations/202607180002_dry_run.sql`](./supabase/migrations/202607180002_dry_run.sql)

[`supabase/migrations/202607180003_learning_documents.sql`](./supabase/migrations/202607180003_learning_documents.sql)

[`supabase/migrations/202607180004_atomic_persona_bootstrap.sql`](./supabase/migrations/202607180004_atomic_persona_bootstrap.sql)

[`supabase/migrations/202607190001_vocabulary_check.sql`](./supabase/migrations/202607190001_vocabulary_check.sql)

[`supabase/migrations/20260719071503_fix_vocabulary_session_completion_outcomes.sql`](./supabase/migrations/20260719071503_fix_vocabulary_session_completion_outcomes.sql)

[`supabase/migrations/20260719090126_index_vocabulary_session_counts.sql`](./supabase/migrations/20260719090126_index_vocabulary_session_counts.sql)

[`supabase/migrations/20260719130040_save_assessment_answers_atomically.sql`](./supabase/migrations/20260719130040_save_assessment_answers_atomically.sql)

### One-time repair for the existing `english-app` project

The first five application migrations were originally run through the SQL
Editor. Their schema is already present, but their versions must be marked as
applied once so the CLI does not try to execute older SQL after a newer fix.
The production project was repaired on 2026-07-19. Run
`npm run db:migrations:list`; it should show every version in both the local and
remote columns. Skip the command below when they already match, and always skip
it for a brand-new Supabase project.

```bash
npm run db:migrations:list
npm run supabase -- migration repair --linked --status applied \
  202607180001 202607180002 202607180003 202607180004 202607190001
npm run db:migrations:list
```

`migration repair` changes tracking metadata only; it does not execute schema
SQL. Confirm that the five versions move into the remote column before pushing.

For both existing and new projects, preview the exact pending list and then
apply it:

```bash
npm run db:migrations:check
npm run db:migrations:push
npm run db:migrations:list
```

The migrations create:

- `learner_profiles`
- `assessment_attempts`
- `assessment_rounds`
- `assessment_questions` — browser-safe question content
- `assessment_answer_keys` — server-only
- `assessment_responses`

Only the learner profile is directly readable by its authenticated owner.
Assessment internals are revoked from `anon` and `authenticated`; the personal
bridge returns a safe projection with no correct answer, CEFR, difficulty, or
explanation.

The third migration adds the canonical versioned Persona, immutable assessment
reports, per-feature Codex thread references, audit records, and a durable
analysis queue. These tables are server-only; even an authenticated browser
cannot query them directly.

The vocabulary migration adds the shared word/idiom master, per-user current
classification, simple classification history, and resumable ordered queues.
These tables and their functions are also bridge-only.

## 4. Import the vocabulary sources

Place these local source files in the repository root:

- `words-1900.pdf` — English Vocabulary Target 1900, 6th edition
- `idioms.tsv` — columns `No`, `熟語`, and `意味`

Install Poppler so `pdftotext` is available, then run:

```bash
brew install poppler
npm run vocabulary:import
```

The importer validates a complete 1–1900 word sequence and 1–1684 idiom
sequence before upserting anything. The source files are intentionally ignored
by Git; only the parser and migration belong in the public repository.

## 5. Personal AI bridge environment

Copy `.env.server.example` to `.env.server` and fill in:

```dotenv
AI_BRIDGE_PORT=8787
AI_ALLOWED_ORIGINS=http://localhost:5173,https://seenyo.github.io
AI_ALLOWED_EMAILS=first-owned-account@gmail.com,second-owned-account@gmail.com
ASSESSMENT_MODE=live
SUPABASE_URL=https://zqmscunpbzungopdegym.supabase.co
SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY
SUPABASE_SECRET_KEY=YOUR-SERVER-ONLY-SECRET-OR-SERVICE-ROLE-KEY
```

Find the server-only key in Supabase Project Settings → API. It belongs only in
`.env.server`; never paste it into GitHub Pages secrets and never commit it.

`AI_ALLOWED_EMAILS` is enforced after Supabase validates the JWT. Add only the
Google accounts you personally own and use for persona testing.

## 6. Codex subscription login

The bridge does not read `auth.json` itself. It lets the Codex SDK use the
normal saved CLI login.

```bash
codex login status
```

Expected output: `Logged in using ChatGPT`. If needed, run `codex login` once.

## 7. Start both processes

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run dev:ai
```

The AI bridge listens only on `127.0.0.1`. Its health endpoint is
<http://127.0.0.1:8787/health>.

## 8. Optional fixed-question dry-run

Temporarily add the account whose latest completed assessment should become
the fixed fixture to `.env.server`:

```dotenv
DRY_RUN_FIXTURE_SOURCE_EMAIL=your-owned-source-account@gmail.com
```

Import the latest completed 10/10/5 assessment once:

```bash
npm run dry-run:seed
```

The import copies all 25 questions and answer keys into server-only Supabase
tables. It prints metadata only; question content and keys never enter the
browser or repository. Then start the bridge in exclusive dry-run mode:

```bash
npm run dev:ai:dry-run
```

Dry-run behavior:

- the persona form is never persisted and never overwrites `learner_profiles`
- answers, round scores, resume state, and completed history use only
  `dry_run_*` tables
- the normal CEFR, normal attempt history, and 30-day retake rule are unchanged
- persona start and Rounds 1/2 show the processing illustration for at least
  10 seconds; Round 3 returns directly to the home result card
- no Codex analysis runs, Persona document, feedback report, or Persona update
  is created or exposed in dry-run mode
- runs are unlimited; an unfinished run resumes unless explicitly abandoned

## 9. Post-assessment analysis

In live mode, Question 25 is scored first and the browser returns to Home
immediately. The bridge then resumes the assessment's Codex thread in the
background, validates its structured response, and atomically stores:

- a detailed Japanese report with all 25 answers
- an updated AI-inferred Persona section
- an immutable Persona revision and evidence observation
- run/job metadata for repair and retry

If the bridge stops midway, restart `npm run dev:ai`; pending or expired jobs
are reclaimed. A missing local Codex thread is rotated once using the complete
stored assessment context. Persona goals, motivation, interests, and self-note
remain user-owned; measured levels and counters remain read-only.

## 10. Optional Codex-only smoke test

```bash
npm run ai:smoke
```

This generates one 10-question Round 1 using the saved ChatGPT login. The
terminal prints only thread ID, repair count, question count, and categories —
never the answer key.

## 11. GitHub Pages

The static frontend still deploys from `main`. GitHub Actions requires only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optionally `VITE_AI_BRIDGE_URL`

For use on the same Mac, the default bridge URL is `http://127.0.0.1:8787`.
The bridge itself is never deployed to GitHub Pages.
