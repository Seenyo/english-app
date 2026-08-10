-- Continuation must service scheduled reviews before advancing into unseen
-- sections. The original implementation ordered only by the last section,
-- which could postpone an overdue earlier section until a full wraparound.

create or replace function public.start_vocabulary_memory_continuation_session(
  p_user_id uuid,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_start_section smallint := 1;
  v_section smallint;
begin
  if p_kind not in ('word', 'idiom') then
    raise exception using
      errcode = '22023',
      message = 'invalid_vocabulary_kind';
  end if;

  select session.id
  into v_existing_id
  from public.vocabulary_memory_sessions session
  where session.user_id = p_user_id
    and session.kind = p_kind
    and session.status = 'active'
  order by session.updated_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select session.section
  into v_start_section
  from public.vocabulary_memory_sessions session
  where session.user_id = p_user_id
    and session.kind = p_kind
    and session.status = 'completed'
  order by session.completed_at desc
  limit 1;

  v_start_section := coalesce(v_start_section, 1::smallint);

  select candidate.section
  into v_section
  from (
    select
      item.section,
      min(progress.due_at) filter (
        where progress.item_id is not null
          and progress.due_at <= now()
      ) as earliest_due_at
    from public.vocabulary_items item
    left join public.vocabulary_memory_progress progress
      on progress.item_id = item.id
     and progress.user_id = p_user_id
    where item.owner_user_id is null
      and item.kind = p_kind
      and item.section is not null
      and (progress.item_id is null or progress.due_at <= now())
    group by item.section
  ) candidate
  order by
    case when candidate.earliest_due_at is not null then 0 else 1 end,
    candidate.earliest_due_at nulls last,
    case when candidate.section >= v_start_section then 0 else 1 end,
    candidate.section
  limit 1;

  if v_section is null then
    raise exception using
      errcode = 'P0002',
      message = 'vocabulary_memory_queue_empty';
  end if;

  return public.start_vocabulary_memory_section_session(
    p_user_id,
    p_kind,
    v_section
  );
end;
$$;

revoke all on function public.start_vocabulary_memory_continuation_session(
  uuid,
  text
) from anon, authenticated, public;

grant execute on function public.start_vocabulary_memory_continuation_session(
  uuid,
  text
) to service_role;
