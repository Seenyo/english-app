# English-Study Webapp — Scaffold (auth + per-user storage + deploy)

## Context

Greenfield webapp to study English. This pass delivers **only the five system-level requirements** — deliberately no study features (no flashcards, no quizzes):

1. Responsive design (mobile + desktop)
2. Latest web framework + latest features
3. Google login
4. Supabase per-user data storage (each user isolated)
5. GitHub Pages deployment

The scaffold proves the plumbing end-to-end with a minimal per-user `notes` demo on the protected Dashboard. Study features come in a later pass.

### Confirmed decisions
- **Local dir:** `/Users/seeenyo/projects/english` — **already `git init`-ed**, on branch `main`, with `PLAN.md` untracked. Do NOT re-init; just add/commit on `main`.
- **Remote repo:** `english-app` under account `Seenyo` → live URL `https://seenyo.github.io/english-app/`. I create the repo and push.
- **Creds:** scaffold with **placeholders** + a click-by-click `SETUP.md`. No secrets in chat. The deployed site gracefully shows a "configure Supabase" state until real keys are added; build and serve succeed with no secrets present.
- **Toolchain present:** Node v22.23.1, npm 10.9.8, git 2.50.1, `gh` 2.96.0 (logged in as `Seenyo`, scopes `repo` + `workflow`).

## Stack (latest, verified mid-2026)

| Concern | Choice | Verified |
|---|---|---|
| UI | React 19 (19.2.x) | current |
| Build | Vite 8 (Rolldown) — stable Mar 12 2026 | current |
| Routing | **React Router v8** — `react-router` package, **declarative mode** | v8.0 Jun 17 2026 (v8.2 latest) |
| Styling | Tailwind CSS v4 — `@tailwindcss/vite` + `@import "tailwindcss"` (CSS-first, no JS config, no PostCSS) | current |
| Language | TypeScript 6 (`strict` on by default) | 6.0 Mar 23 2026 |
| Backend | `@supabase/supabase-js` v2, **PKCE** auth flow | current |
| Deploy | GitHub Pages via Actions (`deploy-pages@v4`, `upload-pages-artifact@v3`, `configure-pages@v5`) | current |

Exact patch versions resolve at install via `npm i <pkg>@latest`. No shadcn/ui yet — Tailwind alone keeps the scaffold lean; trivial to add later.

### React Router v8 import contract (req #2 "latest")
`react-router-dom` is **removed** in v8. Install the single **`react-router`** package and use **declarative mode** (the only mode that deploys as a static SPA to Pages — no data routers, no server/framework adapter):
- DOM-specific APIs → `import { BrowserRouter } from "react-router/dom"`
- Everything else → `import { Routes, Route, Link, Navigate, useNavigate } from "react-router"`
`BrowserRouter` still accepts `basename` in v8, so `basename={import.meta.env.BASE_URL}` is correct.

### Server-side env invariant (security)
Only two frontend env vars exist: **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (the anon/publishable key — PUBLIC, ships in the bundle; its safety depends ENTIRELY on the RLS contract below). The **`service_role`/secret key is NEVER referenced in `src/`, NEVER prefixed `VITE_`, and NEVER committed** (it bypasses RLS for anyone who reads it). `.env` / `.env.local` are gitignored. Optional CI guard: a step that greps `dist/` for the secret-key prefix and fails if any non-allowlisted `VITE_` var appears.

## File structure (created in `/Users/seeenyo/projects/english`)

```
.env.example                  # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY placeholders
.env                          # gitignored; filled locally only
.gitignore                    # .env, .env.local, *.local, node_modules, dist, .DS_Store
.nvmrc                        # "22"
.github/workflows/deploy.yml  # build + deploy to Pages
index.html                    # lang="en", charset, viewport meta, title, #root
package.json                  # scripts: dev, build (tsc -b && vite build && 404 copy), typecheck
package-lock.json             # committed; CI uses npm ci
tsconfig.json                 # references app + node
tsconfig.app.json             # DOM app code (src/)
tsconfig.node.json            # vite.config.ts (node types)
vite.config.ts                # plugin-react + @tailwindcss/vite, dynamic base
scripts/postbuild.mjs         # portable dist/index.html -> dist/404.html
SETUP.md                      # Supabase + Google Cloud + RLS SQL, step by step
README.md                     # run/deploy overview
src/
  main.tsx                    # mount <App/>, import index.css
  App.tsx                     # <ErrorBoundary> > <BrowserRouter basename> > <AuthProvider> > <Routes>
  index.css                   # @import "tailwindcss"; (+ minor base styles)
  vite-env.d.ts               # ImportMetaEnv typings for the two vars
  lib/supabase.ts             # createClient; missing env -> exports null
  auth/AuthContext.tsx        # three-state model: { session, user, isLoading, configured }
  auth/useAuth.ts             # convenience hook
  components/Layout.tsx       # responsive nav shell (brand + auth menu)
  components/RequireAuth.tsx  # spinner while loading; redirect to / if unauthenticated
  components/ErrorBoundary.tsx# root friendly fallback
  components/LoginButton.tsx  # signInWithOAuth({provider:'google'}) + OAuth error surface
  components/UserMenu.tsx     # avatar/email + signOut({scope:'local'})
  routes/Home.tsx             # public landing
  routes/Dashboard.tsx        # protected: per-user note demo with empty/error/loading states
```

## Key implementation details

### Dynamic base path + router basename (req #5)
`vite.config.ts` derives an **absolute** base from `GITHUB_REPOSITORY` (`process.env` at build time):
```ts
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({
  base: repo ? `/${repo}/` : '/',   // -> "/english-app/" in CI, "/" locally. NEVER use base:'./'
  plugins: [react(), tailwindcss()],
});
```
Router: `<BrowserRouter basename={import.meta.env.BASE_URL}>` — matches the base automatically. Absolute base is required so deep-link assets resolve; relative `base:'./'` breaks deep links and the 404 fallback cannot rescue it.

### SPA deep-link fix (portable) + TS build gate
`package.json`:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build && node scripts/postbuild.mjs",
  "typecheck": "tsc -b",
  "preview": "vite preview"
}
```
`scripts/postbuild.mjs` (ESM, cross-platform — avoids `cp` which breaks Windows local dev):
```js
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
```
`tsc -b` runs first so **TS 6 strict-by-default type errors fail the deploy** (not just "it built"). `dist/404.html` is honored by `actions/deploy-pages` artifact deploys, so client-route refreshes recover instead of 404'ing.

### TypeScript config (TS 6 / Vite 8 compatible)
- `tsconfig.app.json` (for `src/`): `target ES2022`, `module ESNext`, `moduleResolution "bundler"` (TS 6 default; `classic` is removed), `jsx "react-jsx"`, `strict` (on by default in TS 6), `lib ["DOM","DOM.Iterable"]`, `types ["vite/client"]`, `noEmit true`, `include ["src"]`.
- `tsconfig.node.json` (for `vite.config.ts` + `scripts/`): same resolution, `types ["node"]`, `include ["vite.config.ts","scripts/**/*.mjs"]`.
- `tsconfig.json`: `files: []`, `references` to app + node (drives `tsc -b`).
`vite-env.d.ts` declares `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` on `ImportMetaEnv` so `tsc -b` passes.

### Auth — three-state model + PKCE (req #3)  [fixes the initial-load flash-redirect]
`lib/supabase.ts` (guard is a truthy/empty-string check, since an unset CI secret inlines as `''`):
```ts
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null; // null => configure state
```
`AuthContext` exposes `{ session, user, isLoading, configured }`:
- **If `supabase === null`:** `configured=false`, `isLoading=false`, `session=null`. Do NOT subscribe; signIn/signOut surface the configure-state UI.
- **On mount:** call `supabase.auth.getSession()` to seed `session`, then set `isLoading=false`. Treat the `INITIAL_SESSION` event as authoritative (`getSession()` can read stale storage).
- **Subscribe** to `onAuthStateChange` for `INITIAL_SESSION` / `SIGNED_IN` / `SIGNED_OUT` / `TOKEN_REFRESHED`. Avoid heavy Supabase calls inside the callback (known to hang `getSession`).
- **`RequireAuth`:** while `isLoading` render a spinner (NOT a redirect); once `!isLoading && !session` → `<Navigate to="/" replace/>`.

OAuth: `signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin + import.meta.env.BASE_URL } })` → `http://localhost:5173/` locally and `https://seenyo.github.io/english-app/` in prod (both whitelisted in SETUP). supabase-js auto-exchanges the PKCE code on return — no server callback route. `signOut({ scope:'local' })` (v2 default is `'global'`, which signs out every device). **OAuth failure path:** capture the error event from `onAuthStateChange` and surface a banner on `LoginButton`/Home rather than silently staying signed out.

### Responsive (req #1)
`index.html` includes `<html lang="en">`, `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>`. `Layout` demonstrates a real responsive pattern: a top nav that collapses to a compact menu on mobile, content in a `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` container. Tailwind v4 mobile-first utilities throughout.

### Graceful degradation + ErrorBoundary
`<ErrorBoundary>` at the App root (above `<BrowserRouter>`) renders a friendly "Something went wrong — reload" fallback for any uncaught throw, so a malformed Supabase response or render error never white-screens. When the client is null or the `notes` table is absent, the UI degrades instead of crashing.

### Dashboard note-demo states
- **loading** — skeleton while listing.
- **empty** — "no notes yet" placeholder.
- **error** — distinguish `relation "notes" does not exist` (table/RLS not applied → message pointing to `SETUP.md`) from a network failure.
- The client **omits `user_id` from insert payloads** — inserts send `{ content }` only; the DB binds ownership (see schema).

## Per-user storage (req #4) — schema + RLS contract, fully pinned

This is the **entire security model** for requirement #4 (frontend filtering is meaningless against directly-callable clients). The exact SQL below is inline here and is pasted verbatim into `SETUP.md`; run it in the Supabase SQL editor. **Do NOT accept the Supabase dashboard's default `USING(true) WITH CHECK(true)` suggestion** — it exposes every user's rows to every authenticated user (the classic isolation failure).

```sql
-- 1) Demo table (per-user storage proof for req #4).
--    user_id is NOT NULL and defaults to the authenticated caller on insert,
--    so honest clients omit user_id; a forged user_id is caught by WITH CHECK.
create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content    text not null default '',
  created_at timestamptz not null default now()
);

-- 2) Lock down: ENABLE and FORCE RLS (FORCE so even the table owner cannot bypass).
alter table notes enable row level security;
alter table notes force row level security;

-- 3) Least-privilege grants: ONLY authenticated gets DML; anon/public get NOTHING.
revoke all on notes from anon, public;
grant select, insert, update, delete on notes to authenticated;

-- 4) Owner-scoped policy for SELECT/INSERT/UPDATE/DELETE.
--    Explicit WITH CHECK so writes can never be loosened by accident
--    (a client inserting/updating a row owned by another user is rejected).
drop policy if exists notes_isolated on notes;
create policy notes_isolated
  on notes for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Invariants (reviewable):**
- `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE` — no orphan/null-owner rows; honest inserts are server-bound.
- **ENABLE + FORCE ROW LEVEL SECURITY** — table owner and `anon` cannot bypass.
- **Only `authenticated` gets DML; `anon`/`public` revoked.**
- **Explicit `WITH CHECK(auth.uid() = user_id)`** on all writes — primary enforcement. A forged `user_id` (another user's id) in an insert/update is **rejected** with `new row violates row-level security policy`.
- The anon key being public is safe **only because this policy holds**.

### Cross-user isolation test strategy (adversarial — required)
A single-user smoke test passes even with **no RLS at all** (a user only ever inserted their own rows), so it gives false confidence. Run this two-account matrix against the real backend after SETUP, before relying on isolation:

**Tier 1 — live app, two real sessions:**
1. User A signs in, inserts note A. A's list shows note A.
2. User B signs in on a second session/device → `SELECT` returns **0 rows** (B cannot see note A).
3. B attempts `UPDATE`/`DELETE` on note A's `id` → affects **0 rows** (B cannot mutate A's row).
4. B inserts note B (payload `{ content }` only; default binds `user_id` to B). A still **cannot** see note B; it appears in B's list only.

**Tier 2 — SQL editor, prove WITH CHECK rejects a spoofed insert:**
5. In the SQL editor, impersonate B (`set request.jwt.claims` / RLS test role) and run `insert into notes(user_id, content) values ('<A-uuid>','x')` → **REJECTED** with `new row violates row-level security policy` (because `user_id=A` ≠ `auth.uid()=B`). This is the spoofed-`user_id` rejection the contract guarantees.
6. Confirm A's `SELECT` still returns only note A throughout.

A small `scripts/isolation-check.mjs` (two `createClient` sessions driven by two test users' access tokens) can automate Tier 1 steps 1-4 for repeatable, CI-able verification.

## GitHub Pages CI (req #5) — workflow pinned

`.github/workflows/deploy.yml` (fixed body):
```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc   # "22" — matches local Node v22
          cache: npm
      - run: npm ci                   # requires committed package-lock.json
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - id: deploy
        uses: actions/deploy-pages@v4
```
Unset secrets inline as `''` → guarded null-client → configure state. `npm ci` needs the committed `package-lock.json` (run `npm install` locally first to generate it; ensure `.gitignore` excludes only `node_modules`, not the lockfile).

## Deployment flow (what I run after the files exist)

The repo is already initialized on `main`; do NOT `git init`. **Pages must be enabled as an Actions source before the first push can trigger a run**, to avoid the race where `deploy-pages` 404s ("Pages hasn't been enabled for this repository").
1. `git add . && git commit -m "Scaffold: React 19 + Vite 8 + Supabase auth + per-user notes + Pages deploy"` (on `main`).
2. `gh repo create english-app --public --source=.` — creates the remote under Seenyo, adds `origin`. **No `--push`.**
3. `gh api -X POST /repos/Seenyo/english-app/pages -f build_type=workflow` — enable Pages as GitHub Actions source (PUT if it already exists).
4. `git push -u origin main` — triggers the workflow.
5. If a run started before step 3 landed, re-run it: `gh workflow run Deploy` (or Actions UI). The first deploy renders the **"configure Supabase"** placeholder at `https://seenyo.github.io/english-app/`.

## SETUP.md — click-by-click (what the user does afterward; not done by me)

1. **Supabase project.** Create a project → copy **Project URL** and the **anon/publishable key** (Project Settings → API). Note the `project-ref` in the URL.
2. **Google Cloud OAuth client.** APIs & Services → OAuth consent screen (External). Create credentials → OAuth client ID → **Web application**. **Authorized redirect URI:** `https://<project-ref>.supabase.co/auth/v1/callback`. **Authorized JavaScript origins:** `https://seenyo.github.io` and `http://localhost:5173`. Copy the Client ID + Secret.
3. **Supabase Auth config.** Dashboard → Authentication → Providers → **Google** → enable, paste Client ID/Secret. Authentication → URL Configuration → **Site URL** `https://seenyo.github.io/english-app/`; add to **Redirect URLs**: `https://seenyo.github.io/english-app/**` and `http://localhost:5173/**`. (The `redirectTo` value MUST be in this allow-list or Supabase silently falls back to the Site URL.)
4. **Run the SQL.** SQL Editor → paste the pinned `notes` + RLS block (above) → Run. Do NOT use the dashboard default `true`/`true` policy.
5. **Verify isolation (recommended).** Run the Tier 1 two-account matrix and the Tier 2 SQL-editor spoofed-insert rejection above; confirm cross-user access is blocked.
6. **Add repo secrets.** `gh secret set VITE_SUPABASE_URL` and `gh secret set VITE_SUPABASE_ANON_KEY` (or GitHub repo Settings → Secrets and variables → Actions).
7. **Redeploy.** `gh workflow run Deploy` (or Actions UI → re-run). Confirm the configure state is gone and Google login + notes work at `https://seenyo.github.io/english-app/`.

## Verification

**Local (no secrets needed):**
- `npm install` (generates `package-lock.json`) then `npm run build` succeeds; `dist/`, `dist/index.html`, `dist/404.html` exist; `npm run typecheck` is clean.
- `npm run dev` → Home renders, Login button visible; `/dashboard` shows a spinner then redirects to Home while unauthenticated.

**Local auth smoke (once `.env` filled from SETUP step 1):**
- Click Login → Google consent → returns to `/dashboard` showing the user's email, with **no flash-redirect on reload** (the loading gate holds).
- Add a note → it lists; reload → persists; sign out (local scope) → Dashboard becomes inaccessible.
- Cross-user isolation (SETUP step 5) — Tier 1 + Tier 2 pass.

**Deploy:**
- The GitHub Actions **Deploy** run is green; `https://seenyo.github.io/english-app/` loads the placeholder ("configure Supabase") page before secrets, and the full app after secrets + SQL.
- Deep-link refresh (e.g. `/english-app/dashboard`) does not 404.
- With secrets added, Google login lands on `/dashboard` and notes persist per user.
