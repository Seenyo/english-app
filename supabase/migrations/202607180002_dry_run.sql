-- Server-only dry-run assessment storage.
-- Fixed questions are imported from a completed live attempt by the local
-- seed script; no question content, answer key, or source email is committed.

create table if not exists dry_run_question_sets (
  id                  uuid primary key default gen_random_uuid(),
  source_attempt_id   uuid references assessment_attempts(id) on delete set null,
  label               text not null,
  is_active           boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists dry_run_questions (
  id                  uuid primary key default gen_random_uuid(),
  question_set_id     uuid not null references dry_run_question_sets(id) on delete cascade,
  external_id         text not null,
  round_number        smallint not null check (round_number between 1 and 3),
  position            smallint not null check (position > 0),
  category            text not null check (category in ('vocabulary', 'idiom', 'grammar')),
  cefr_level          text not null check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  difficulty_rank     smallint not null check (difficulty_rank between 1 and 10),
  stem                text not null,
  options             jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_option_id   text not null check (correct_option_id in ('A', 'B', 'C', 'D')),
  explanation_ja      text not null,
  learning_point      text not null,
  unique (question_set_id, round_number, external_id),
  unique (question_set_id, round_number, position)
);

create table if not exists dry_run_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  question_set_id     uuid not null references dry_run_question_sets(id),
  status              text not null default 'answering'
                      check (status in ('answering', 'completed', 'abandoned')),
  current_round       smallint not null default 1 check (current_round between 1 and 3),
  estimated_cefr      text check (estimated_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  correct_count       smallint,
  unknown_count       smallint,
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create unique index if not exists dry_run_attempts_one_active_per_user
  on dry_run_attempts(user_id)
  where status = 'answering';

create table if not exists dry_run_rounds (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references dry_run_attempts(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  round_number        smallint not null check (round_number between 1 and 3),
  status              text not null check (status in ('pending', 'answering', 'completed')),
  correct_count       smallint,
  unknown_count       smallint,
  result_payload      jsonb,
  completed_at        timestamptz,
  unique (attempt_id, round_number)
);

create table if not exists dry_run_responses (
  attempt_id          uuid not null references dry_run_attempts(id) on delete cascade,
  question_id         uuid not null references dry_run_questions(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  selected_option_id  text check (selected_option_id in ('A', 'B', 'C', 'D')),
  is_unknown          boolean not null default false,
  answered_at         timestamptz not null default now(),
  primary key (attempt_id, question_id),
  check (
    (is_unknown and selected_option_id is null)
    or (not is_unknown and selected_option_id is not null)
  )
);

create index if not exists dry_run_question_sets_active_idx
  on dry_run_question_sets(is_active, created_at desc);
create index if not exists dry_run_questions_round_idx
  on dry_run_questions(question_set_id, round_number, position);
create index if not exists dry_run_attempts_user_started_idx
  on dry_run_attempts(user_id, started_at desc);
create index if not exists dry_run_responses_attempt_idx
  on dry_run_responses(attempt_id);

drop trigger if exists dry_run_attempts_set_updated_at on dry_run_attempts;
create trigger dry_run_attempts_set_updated_at
before update on dry_run_attempts
for each row execute function set_updated_at();

alter table dry_run_question_sets enable row level security;
alter table dry_run_question_sets force row level security;
alter table dry_run_questions enable row level security;
alter table dry_run_questions force row level security;
alter table dry_run_attempts enable row level security;
alter table dry_run_attempts force row level security;
alter table dry_run_rounds enable row level security;
alter table dry_run_rounds force row level security;
alter table dry_run_responses enable row level security;
alter table dry_run_responses force row level security;

-- Dry-run internals, including fixed answer keys, are available only to the
-- local bridge's service-role client. The browser receives a safe projection.
revoke all on dry_run_question_sets from anon, authenticated, public;
revoke all on dry_run_questions from anon, authenticated, public;
revoke all on dry_run_attempts from anon, authenticated, public;
revoke all on dry_run_rounds from anon, authenticated, public;
revoke all on dry_run_responses from anon, authenticated, public;

grant all on dry_run_question_sets to service_role;
grant all on dry_run_questions to service_role;
grant all on dry_run_attempts to service_role;
grant all on dry_run_rounds to service_role;
grant all on dry_run_responses to service_role;
