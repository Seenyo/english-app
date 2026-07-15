# Setup — Supabase + Google Auth + GitHub Pages

The app ships in a **"configure Supabase"** state until you complete these steps.
Estimated time: 10–15 minutes.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://<project-ref>.supabase.co`)
   - the **anon / publishable key** (`sb_publishable_…` or the legacy `eyJ…` anon key)
3. Note the **`project-ref`** (it's in the dashboard URL:
   `https://supabase.com/dashboard/project/<project-ref>`).

## 2. Create a Google OAuth client

1. <https://console.cloud.google.com> → **APIs & Services → OAuth consent screen**
   (External). Add scopes `openid`, `email`, `profile`.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorized redirect URI:**
   `https://<project-ref>.supabase.co/auth/v1/callback`
4. **Authorized JavaScript origins:** `https://seenyo.github.io` and
   `http://localhost:5173`
5. Copy the **Client ID** and **Client Secret**.

## 3. Configure Supabase Auth

1. Supabase Dashboard → **Authentication → Providers → Google** → enable, paste
   the Client ID / Secret from step 2.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://seenyo.github.io/english-app/`
   - **Redirect URLs** (add both):
     - `https://seenyo.github.io/english-app/**`
     - `http://localhost:5173/**`

> The `redirectTo` passed to `signInWithOAuth` **must** be in this allow-list, or
> Supabase silently falls back to the Site URL.

## 4. Create the `notes` table + RLS (SQL Editor)

Supabase Dashboard → **SQL Editor** → paste → **Run**.

```sql
-- 1) Demo table (per-user storage proof).
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
drop policy if exists notes_isolated on notes;
create policy notes_isolated
  on notes for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Do NOT accept the dashboard's default `USING(true) WITH CHECK(true)` policy** —
it would expose every user's rows to every authenticated user.

## 5. (Recommended) Verify cross-user isolation

A single-user test passes with **no RLS at all**, so it gives false confidence.
Run the two-account matrix in `PLAN.md` ("Cross-user isolation test strategy"):

- **Tier 1** — two real sessions: user B cannot `SELECT`/`UPDATE`/`DELETE` user A's
  rows, and A cannot see B's rows.
- **Tier 2** — SQL editor: a spoofed-`user_id` insert is **rejected** by
  `WITH CHECK`.

## 6. Add repo secrets (so the deploy can bake them in)

```bash
gh secret set VITE_SUPABASE_URL
gh secret set VITE_SUPABASE_ANON_KEY
```

(or GitHub repo **Settings → Secrets and variables → Actions**)

These are public values (safe under RLS) — but never add the **service_role /
secret** key anywhere in this repo.

## 7. Redeploy

```bash
gh workflow run Deploy
```

Then confirm Google login + per-user notes work at
<https://seenyo.github.io/english-app/>.

---

## Local development

```bash
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:5173
```
