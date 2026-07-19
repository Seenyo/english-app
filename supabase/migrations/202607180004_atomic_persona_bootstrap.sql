-- Atomically create the canonical Persona and its version-1 audit record.
-- This also repairs a Persona whose initial revision is missing after an
-- interrupted deployment, without changing the current Persona document.

create or replace function ensure_learner_persona(
  p_user_id uuid,
  p_initial_self_assessment text,
  p_user_authored jsonb,
  p_initial_ai_inferred jsonb,
  p_metrics jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona learner_personas%rowtype;
begin
  insert into learner_personas (
    user_id, initial_self_assessment, user_authored, ai_inferred
  ) values (
    p_user_id,
    p_initial_self_assessment,
    p_user_authored,
    p_initial_ai_inferred
  )
  on conflict (user_id) do nothing;

  select * into v_persona
  from learner_personas
  where user_id = p_user_id
  for update;

  insert into persona_revisions (
    user_id, version, source_kind, persona_snapshot
  ) values (
    p_user_id,
    1,
    case
      when v_persona.version = 1 then 'initial_assessment'
      else 'system_backfill'
    end,
    jsonb_build_object(
      'schemaVersion', v_persona.schema_version,
      'version', 1,
      'initialSelfAssessment', v_persona.initial_self_assessment,
      'userAuthored', p_user_authored,
      'aiInferred', p_initial_ai_inferred,
      'metrics', p_metrics,
      'updatedAt', v_persona.created_at
    )
  )
  on conflict (user_id, version) do nothing;

  return v_persona.version;
end;
$$;

revoke all on function ensure_learner_persona(uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function ensure_learner_persona(uuid, text, jsonb, jsonb, jsonb)
  to service_role;
