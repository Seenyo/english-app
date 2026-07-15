# English Study

A minimal scaffold proving the end-to-end plumbing — **no study features yet**.

| Concern  | Stack                                                                  |
| -------- | ---------------------------------------------------------------------- |
| UI       | React 19                                                               |
| Build    | Vite 8 (Rolldown)                                                      |
| Routing  | React Router v8 (declarative)                                          |
| Styling  | Tailwind CSS v4 (`@tailwindcss/vite`)                                  |
| Language | TypeScript 6 (strict)                                                  |
| Backend  | Supabase — Google OAuth (PKCE) + per-user `notes` (Row Level Security) |
| Deploy   | GitHub Pages via GitHub Actions                                        |

## Develop

```bash
npm install
cp .env.example .env   # add your Supabase URL + anon key (see SETUP.md)
npm run dev            # http://localhost:5173
```

The app runs even without credentials — it shows a "configure Supabase" state
until keys are added.

## Build

```bash
npm run build          # tsc -b (type-check) + vite build + 404.html fallback
npm run typecheck      # tsc -b only
```

Output is a fully static `dist/`.

## Deploy

Pushing to `main` triggers the **Deploy** workflow, which builds and publishes to
GitHub Pages at <https://seenyo.github.io/english-app/>.

The first deploy renders a "configure Supabase" placeholder. Complete
**`SETUP.md`** (Supabase project, Google OAuth client, RLS SQL, repo secrets),
then re-run the workflow.

## Docs

- [`PLAN.md`](./PLAN.md) — full design (stack, schema + RLS contract, CI).
- [`SETUP.md`](./SETUP.md) — step-by-step cloud setup.
