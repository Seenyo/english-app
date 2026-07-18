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

## 3. Apply the assessment database migration

Open the Supabase SQL Editor and run the complete contents of:

[`supabase/migrations/202607180001_assessment.sql`](./supabase/migrations/202607180001_assessment.sql)

The migration creates:

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

## 4. Personal AI bridge environment

Copy `.env.server.example` to `.env.server` and fill in:

```dotenv
AI_BRIDGE_PORT=8787
AI_ALLOWED_ORIGINS=http://localhost:5173,https://seenyo.github.io
AI_ALLOWED_EMAILS=first-owned-account@gmail.com,second-owned-account@gmail.com
SUPABASE_URL=https://zqmscunpbzungopdegym.supabase.co
SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY
SUPABASE_SECRET_KEY=YOUR-SERVER-ONLY-SECRET-OR-SERVICE-ROLE-KEY
```

Find the server-only key in Supabase Project Settings → API. It belongs only in
`.env.server`; never paste it into GitHub Pages secrets and never commit it.

`AI_ALLOWED_EMAILS` is enforced after Supabase validates the JWT. Add only the
Google accounts you personally own and use for persona testing.

## 5. Codex subscription login

The bridge does not read `auth.json` itself. It lets the Codex SDK use the
normal saved CLI login.

```bash
codex login status
```

Expected output: `Logged in using ChatGPT`. If needed, run `codex login` once.

## 6. Start both processes

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

## 7. Optional Codex-only smoke test

```bash
npm run ai:smoke
```

This generates one 10-question Round 1 using the saved ChatGPT login. The
terminal prints only thread ID, repair count, question count, and categories —
never the answer key.

## 8. GitHub Pages

The static frontend still deploys from `main`. GitHub Actions requires only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optionally `VITE_AI_BRIDGE_URL`

For use on the same Mac, the default bridge URL is `http://127.0.0.1:8787`.
The bridge itself is never deployed to GitHub Pages.
