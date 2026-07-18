-- Adaptive English placement assessment.
-- All answer keys and Codex thread identifiers are server-only. The browser
-- reaches them only through the personal AI bridge after Supabase JWT checks.

create table if not exists learner_profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  self_assessment     text not null check (char_length(self_assessment) between 20 and 4000),
  eiken_grade         text check (eiken_grade in ('5', '4', '3', 'pre-2', '2', 'pre-1', '1')),
  toeic_score         integer check (toeic_score between 10 and 990),
  current_cefr        text check (current_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  target_cefr         text check (target_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  assessed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists assessment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'generating'
                      check (status in ('generating', 'answering', 'completed', 'failed', 'abandoned')),
  current_round       smallint not null default 1 check (current_round between 1 and 3),
  codex_thread_id     text,
  profile_snapshot    jsonb not null,
  estimated_cefr      text check (estimated_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  correct_count       smallint,
  unknown_count       smallint,
  error_code          text,
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create unique index if not exists assessment_attempts_one_active_per_user
  on assessment_attempts(user_id)
  where status in ('generating', 'answering', 'failed');

create table if not exists assessment_rounds (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references assessment_attempts(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  round_number        smallint not null check (round_number between 1 and 3),
  status              text not null default 'generating'
                      check (status in ('generating', 'answering', 'completed', 'failed')),
  calibration_summary text,
  repair_count        smallint not null default 0 check (repair_count between 0 and 10),
  correct_count       smallint,
  unknown_count       smallint,
  result_payload      jsonb,
  generated_at        timestamptz,
  completed_at        timestamptz,
  unique (attempt_id, round_number)
);

create table if not exists assessment_questions (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references assessment_attempts(id) on delete cascade,
  round_id            uuid not null references assessment_rounds(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  external_id         text not null,
  position            smallint not null check (position > 0),
  category            text not null check (category in ('vocabulary', 'idiom', 'grammar')),
  cefr_level          text not null check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  difficulty_rank     smallint not null check (difficulty_rank between 1 and 10),
  stem                text not null,
  options             jsonb not null check (jsonb_typeof(options) = 'array'),
  learning_point      text not null,
  unique (round_id, external_id),
  unique (round_id, position)
);

create table if not exists assessment_answer_keys (
  question_id         uuid primary key references assessment_questions(id) on delete cascade,
  correct_option_id   text not null check (correct_option_id in ('A', 'B', 'C', 'D')),
  explanation_ja      text not null
);

create table if not exists assessment_responses (
  question_id         uuid primary key references assessment_questions(id) on delete cascade,
  attempt_id          uuid not null references assessment_attempts(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  selected_option_id  text check (selected_option_id in ('A', 'B', 'C', 'D')),
  is_unknown          boolean not null default false,
  answered_at         timestamptz not null default now(),
  check (
    (is_unknown and selected_option_id is null)
    or (not is_unknown and selected_option_id is not null)
  )
);

create index if not exists assessment_attempts_user_started_idx
  on assessment_attempts(user_id, started_at desc);
create index if not exists assessment_questions_attempt_round_idx
  on assessment_questions(attempt_id, round_id, position);
create index if not exists assessment_responses_attempt_idx
  on assessment_responses(attempt_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists learner_profiles_set_updated_at on learner_profiles;
create trigger learner_profiles_set_updated_at
before update on learner_profiles
for each row execute function set_updated_at();

drop trigger if exists assessment_attempts_set_updated_at on assessment_attempts;
create trigger assessment_attempts_set_updated_at
before update on assessment_attempts
for each row execute function set_updated_at();

alter table learner_profiles enable row level security;
alter table learner_profiles force row level security;
alter table assessment_attempts enable row level security;
alter table assessment_attempts force row level security;
alter table assessment_rounds enable row level security;
alter table assessment_rounds force row level security;
alter table assessment_questions enable row level security;
alter table assessment_questions force row level security;
alter table assessment_answer_keys enable row level security;
alter table assessment_answer_keys force row level security;
alter table assessment_responses enable row level security;
alter table assessment_responses force row level security;

revoke all on learner_profiles from anon, public;
revoke all on learner_profiles from authenticated;
grant select on learner_profiles to authenticated;
grant insert (user_id, self_assessment, eiken_grade, toeic_score, target_cefr)
  on learner_profiles to authenticated;
grant update (self_assessment, eiken_grade, toeic_score, target_cefr)
  on learner_profiles to authenticated;
grant all on learner_profiles to service_role;

drop policy if exists learner_profiles_isolated on learner_profiles;
create policy learner_profiles_isolated
  on learner_profiles for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Assessment internals are intentionally unavailable through the public
-- PostgREST client, even to their owner. The AI bridge returns a safe projection.
revoke all on assessment_attempts from anon, authenticated, public;
revoke all on assessment_rounds from anon, authenticated, public;
revoke all on assessment_questions from anon, authenticated, public;
revoke all on assessment_answer_keys from anon, authenticated, public;
revoke all on assessment_responses from anon, authenticated, public;

grant all on assessment_attempts to service_role;
grant all on assessment_rounds to service_role;
grant all on assessment_questions to service_role;
grant all on assessment_answer_keys to service_role;
grant all on assessment_responses to service_role;
