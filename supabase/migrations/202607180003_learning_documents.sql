-- Canonical learner persona, immutable assessment feedback, and durable
-- background-analysis jobs. All writes go through the local bridge so field
-- ownership, revision history, and Codex output validation stay centralized.

alter table assessment_attempts
  add column if not exists persona_version integer,
  add column if not exists persona_snapshot jsonb;

create table if not exists learning_agent_threads (
  user_id             uuid not null references auth.users(id) on delete cascade,
  agent_kind          text not null
                      check (agent_kind in ('assessment', 'vocabulary', 'sentence_order', 'reading', 'writing')),
  scope_key           text not null default 'default',
  codex_thread_id     text not null,
  status              text not null default 'active'
                      check (status in ('active', 'rotated', 'failed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_used_at        timestamptz not null default now(),
  primary key (user_id, agent_kind, scope_key)
);

create table if not exists learner_personas (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  schema_version          integer not null default 1 check (schema_version > 0),
  version                 integer not null default 1 check (version > 0),
  initial_self_assessment text not null
                          check (char_length(initial_self_assessment) between 20 and 4000),
  user_authored           jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(user_authored) = 'object'),
  ai_inferred             jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(ai_inferred) = 'object'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists persona_revisions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  version             integer not null check (version > 0),
  source_kind         text not null
                      check (source_kind in ('initial_assessment', 'assessment_analysis', 'user_edit', 'system_backfill')),
  source_id           uuid,
  persona_snapshot    jsonb not null check (jsonb_typeof(persona_snapshot) = 'object'),
  created_at          timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists persona_observations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  agent_kind          text not null,
  source_id           uuid,
  base_version        integer not null check (base_version > 0),
  observation_payload jsonb not null check (jsonb_typeof(observation_payload) = 'object'),
  applied_version     integer,
  created_at          timestamptz not null default now()
);

create table if not exists assessment_reports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  attempt_id          uuid not null references assessment_attempts(id) on delete cascade,
  persona_version     integer not null check (persona_version > 0),
  prompt_version      text not null,
  codex_thread_id     text not null,
  report_payload      jsonb not null check (jsonb_typeof(report_payload) = 'object'),
  report_markdown     text not null,
  created_at          timestamptz not null default now(),
  unique (attempt_id)
);

create table if not exists assessment_analysis_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  attempt_id          uuid not null references assessment_attempts(id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending', 'running', 'completed', 'failed')),
  run_count           integer not null default 0 check (run_count between 0 and 20),
  next_retry_at       timestamptz not null default now(),
  lease_expires_at    timestamptz,
  last_error_code     text,
  last_error_message  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (attempt_id)
);

create table if not exists agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  agent_kind          text not null,
  operation           text not null,
  source_id           uuid,
  codex_thread_id     text,
  prompt_version      text not null,
  status              text not null check (status in ('running', 'completed', 'failed')),
  repair_count        integer not null default 0 check (repair_count between 0 and 10),
  error_code          text,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists persona_revisions_user_created_idx
  on persona_revisions(user_id, created_at desc);
create index if not exists persona_observations_user_created_idx
  on persona_observations(user_id, created_at desc);
create index if not exists assessment_reports_user_created_idx
  on assessment_reports(user_id, created_at desc);
create index if not exists assessment_analysis_jobs_ready_idx
  on assessment_analysis_jobs(status, next_retry_at, created_at);
create index if not exists agent_runs_user_started_idx
  on agent_runs(user_id, started_at desc);

drop trigger if exists learning_agent_threads_set_updated_at on learning_agent_threads;
create trigger learning_agent_threads_set_updated_at
before update on learning_agent_threads
for each row execute function set_updated_at();

drop trigger if exists learner_personas_set_updated_at on learner_personas;
create trigger learner_personas_set_updated_at
before update on learner_personas
for each row execute function set_updated_at();

drop trigger if exists assessment_analysis_jobs_set_updated_at on assessment_analysis_jobs;
create trigger assessment_analysis_jobs_set_updated_at
before update on assessment_analysis_jobs
for each row execute function set_updated_at();

alter table learning_agent_threads enable row level security;
alter table learning_agent_threads force row level security;
alter table learner_personas enable row level security;
alter table learner_personas force row level security;
alter table persona_revisions enable row level security;
alter table persona_revisions force row level security;
alter table persona_observations enable row level security;
alter table persona_observations force row level security;
alter table assessment_reports enable row level security;
alter table assessment_reports force row level security;
alter table assessment_analysis_jobs enable row level security;
alter table assessment_analysis_jobs force row level security;
alter table agent_runs enable row level security;
alter table agent_runs force row level security;

-- These documents can contain private self-reports, answer keys, model
-- inferences, and local Codex thread identifiers. The browser receives only
-- validated projections through the authenticated local bridge.
revoke all on learning_agent_threads from anon, authenticated, public;
revoke all on learner_personas from anon, authenticated, public;
revoke all on persona_revisions from anon, authenticated, public;
revoke all on persona_observations from anon, authenticated, public;
revoke all on assessment_reports from anon, authenticated, public;
revoke all on assessment_analysis_jobs from anon, authenticated, public;
revoke all on agent_runs from anon, authenticated, public;

grant all on learning_agent_threads to service_role;
grant all on learner_personas to service_role;
grant all on persona_revisions to service_role;
grant all on persona_observations to service_role;
grant all on assessment_reports to service_role;
grant all on assessment_analysis_jobs to service_role;
grant all on agent_runs to service_role;

create or replace function update_persona_user_authored(
  p_user_id uuid,
  p_expected_version integer,
  p_user_authored jsonb,
  p_metrics jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona learner_personas%rowtype;
  v_new_version integer;
  v_now timestamptz := now();
begin
  select * into v_persona
  from learner_personas
  where user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'persona_not_found';
  end if;
  if v_persona.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'persona_version_conflict';
  end if;

  v_new_version := v_persona.version + 1;
  update learner_personas
  set user_authored = p_user_authored,
      version = v_new_version,
      updated_at = v_now
  where user_id = p_user_id;

  insert into persona_revisions (
    user_id, version, source_kind, persona_snapshot
  ) values (
    p_user_id,
    v_new_version,
    'user_edit',
    jsonb_build_object(
      'schemaVersion', v_persona.schema_version,
      'version', v_new_version,
      'initialSelfAssessment', v_persona.initial_self_assessment,
      'userAuthored', p_user_authored,
      'aiInferred', v_persona.ai_inferred,
      'metrics', p_metrics,
      'updatedAt', v_now
    )
  );
  return v_new_version;
end;
$$;

create or replace function complete_assessment_analysis(
  p_user_id uuid,
  p_attempt_id uuid,
  p_expected_persona_version integer,
  p_ai_inferred jsonb,
  p_metrics jsonb,
  p_observation jsonb,
  p_report_id uuid,
  p_prompt_version text,
  p_codex_thread_id text,
  p_report_payload jsonb,
  p_report_markdown text,
  p_repair_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona learner_personas%rowtype;
  v_new_version integer;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from assessment_attempts
    where id = p_attempt_id and user_id = p_user_id and status = 'completed'
  ) then
    raise exception using errcode = 'P0002', message = 'completed_attempt_not_found';
  end if;

  select * into v_persona
  from learner_personas
  where user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'persona_not_found';
  end if;
  if v_persona.version <> p_expected_persona_version then
    raise exception using errcode = '40001', message = 'persona_version_conflict';
  end if;

  v_new_version := v_persona.version + 1;
  update learner_personas
  set ai_inferred = p_ai_inferred,
      version = v_new_version,
      updated_at = v_now
  where user_id = p_user_id;

  insert into persona_observations (
    user_id, agent_kind, source_id, base_version,
    observation_payload, applied_version
  ) values (
    p_user_id, 'assessment', p_attempt_id, p_expected_persona_version,
    p_observation, v_new_version
  );

  insert into persona_revisions (
    user_id, version, source_kind, source_id, persona_snapshot
  ) values (
    p_user_id,
    v_new_version,
    'assessment_analysis',
    p_attempt_id,
    jsonb_build_object(
      'schemaVersion', v_persona.schema_version,
      'version', v_new_version,
      'initialSelfAssessment', v_persona.initial_self_assessment,
      'userAuthored', v_persona.user_authored,
      'aiInferred', p_ai_inferred,
      'metrics', p_metrics,
      'updatedAt', v_now
    )
  );

  insert into assessment_reports (
    id, user_id, attempt_id, persona_version, prompt_version,
    codex_thread_id, report_payload, report_markdown
  ) values (
    p_report_id, p_user_id, p_attempt_id, v_new_version, p_prompt_version,
    p_codex_thread_id, p_report_payload, p_report_markdown
  );

  insert into learning_agent_threads (
    user_id, agent_kind, scope_key, codex_thread_id, status, last_used_at
  ) values (
    p_user_id, 'assessment', 'default', p_codex_thread_id, 'active', v_now
  )
  on conflict (user_id, agent_kind, scope_key)
  do update set
    codex_thread_id = excluded.codex_thread_id,
    status = 'active',
    last_used_at = v_now,
    updated_at = v_now;

  update assessment_analysis_jobs
  set status = 'completed',
      completed_at = v_now,
      lease_expires_at = null,
      last_error_code = null,
      last_error_message = null
  where attempt_id = p_attempt_id and user_id = p_user_id;

  update agent_runs
  set status = 'completed',
      codex_thread_id = p_codex_thread_id,
      repair_count = p_repair_count,
      completed_at = v_now
  where source_id = p_attempt_id
    and user_id = p_user_id
    and operation = 'assessment_analysis'
    and status = 'running';

  return v_new_version;
end;
$$;

revoke all on function update_persona_user_authored(uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function complete_assessment_analysis(uuid, uuid, integer, jsonb, jsonb, jsonb, uuid, text, text, jsonb, text, integer)
  from public, anon, authenticated;
grant execute on function update_persona_user_authored(uuid, integer, jsonb, jsonb)
  to service_role;
grant execute on function complete_assessment_analysis(uuid, uuid, integer, jsonb, jsonb, jsonb, uuid, text, text, jsonb, text, integer)
  to service_role;
