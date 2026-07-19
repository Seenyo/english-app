-- Save an assessment answer only when it belongs to the round currently
-- displayed by the learner. Locking the attempt makes this check and the
-- upsert atomic with round completion, so a delayed request from an older
-- browser tab cannot overwrite an answer in a later round.

create or replace function public.save_assessment_answer(
  p_user_id uuid,
  p_attempt_id uuid,
  p_round smallint,
  p_question_external_id text,
  p_selected_option_id text,
  p_is_unknown boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.assessment_attempts%rowtype;
  v_question_id uuid;
begin
  if p_round not between 1 and 3
    or p_question_external_id !~ '^q-[1-9][0-9]*$'
    or p_is_unknown is null
    or (p_is_unknown and p_selected_option_id is not null)
    or (not p_is_unknown and p_selected_option_id not in ('A', 'B', 'C', 'D'))
  then
    return 'invalid_answer';
  end if;

  select attempt.*
  into v_attempt
  from public.assessment_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
  for update;

  if not found then
    return 'assessment_not_found';
  end if;

  if v_attempt.status <> 'answering' then
    return 'assessment_not_answering';
  end if;

  if v_attempt.current_round <> p_round then
    return 'round_mismatch';
  end if;

  select question.id
  into v_question_id
  from public.assessment_questions as question
  join public.assessment_rounds as round
    on round.id = question.round_id
  where question.attempt_id = p_attempt_id
    and question.external_id = p_question_external_id
    and round.attempt_id = p_attempt_id
    and round.round_number = p_round
    and round.status = 'answering';

  if not found then
    return 'question_not_found';
  end if;

  insert into public.assessment_responses (
    question_id,
    attempt_id,
    user_id,
    selected_option_id,
    is_unknown,
    answered_at
  )
  values (
    v_question_id,
    p_attempt_id,
    p_user_id,
    p_selected_option_id,
    p_is_unknown,
    now()
  )
  on conflict (question_id) do update
  set selected_option_id = excluded.selected_option_id,
      is_unknown = excluded.is_unknown,
      answered_at = excluded.answered_at;

  return 'saved';
end;
$$;

create or replace function public.save_dry_run_answer(
  p_user_id uuid,
  p_attempt_id uuid,
  p_round smallint,
  p_question_external_id text,
  p_selected_option_id text,
  p_is_unknown boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.dry_run_attempts%rowtype;
  v_question_id uuid;
begin
  if p_round not between 1 and 3
    or p_question_external_id !~ '^q-[1-9][0-9]*$'
    or p_is_unknown is null
    or (p_is_unknown and p_selected_option_id is not null)
    or (not p_is_unknown and p_selected_option_id not in ('A', 'B', 'C', 'D'))
  then
    return 'invalid_answer';
  end if;

  select attempt.*
  into v_attempt
  from public.dry_run_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
  for update;

  if not found then
    return 'assessment_not_found';
  end if;

  if v_attempt.status <> 'answering' then
    return 'assessment_not_answering';
  end if;

  if v_attempt.current_round <> p_round then
    return 'round_mismatch';
  end if;

  select question.id
  into v_question_id
  from public.dry_run_questions as question
  join public.dry_run_rounds as round
    on round.attempt_id = p_attempt_id
    and round.round_number = question.round_number
  where question.question_set_id = v_attempt.question_set_id
    and question.external_id = p_question_external_id
    and question.round_number = p_round
    and round.status = 'answering';

  if not found then
    return 'question_not_found';
  end if;

  insert into public.dry_run_responses (
    attempt_id,
    question_id,
    user_id,
    selected_option_id,
    is_unknown,
    answered_at
  )
  values (
    p_attempt_id,
    v_question_id,
    p_user_id,
    p_selected_option_id,
    p_is_unknown,
    now()
  )
  on conflict (attempt_id, question_id) do update
  set selected_option_id = excluded.selected_option_id,
      is_unknown = excluded.is_unknown,
      answered_at = excluded.answered_at;

  return 'saved';
end;
$$;

revoke all on function public.save_assessment_answer(uuid, uuid, smallint, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_assessment_answer(uuid, uuid, smallint, text, text, boolean)
  to service_role;

revoke all on function public.save_dry_run_answer(uuid, uuid, smallint, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_dry_run_answer(uuid, uuid, smallint, text, text, boolean)
  to service_role;

comment on function public.save_assessment_answer(uuid, uuid, smallint, text, text, boolean)
  is 'Atomically saves a live assessment answer only for the active displayed round.';
comment on function public.save_dry_run_answer(uuid, uuid, smallint, text, text, boolean)
  is 'Atomically saves a dry-run answer only for the active displayed round.';
