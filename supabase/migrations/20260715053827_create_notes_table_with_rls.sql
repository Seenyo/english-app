-- Historical baseline restored from the migration already recorded remotely.
-- Keeping this file makes local and remote migration histories comparable.
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users(id) on delete cascade,
  content    text not null default '',
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;
alter table public.notes force row level security;

revoke all on public.notes from anon, public;
grant select, insert, update, delete on public.notes to authenticated;

drop policy if exists notes_isolated on public.notes;
create policy notes_isolated
  on public.notes for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
