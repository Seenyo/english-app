-- Use the source order as a stable 100-item section for both words and idioms.

alter table public.vocabulary_items
drop constraint vocabulary_items_check;

update public.vocabulary_items
set section = ceil(source_order / 100.0)::smallint
where kind = 'idiom' and section is null;

alter table public.vocabulary_items
add constraint vocabulary_items_check check (
  (kind = 'word' and section is not null and part is not null)
  or (
    kind = 'idiom'
    and section between 1 and 17
    and part is null
  )
);

create index vocabulary_items_kind_section_order_idx
  on public.vocabulary_items(kind, section, source_order)
  where owner_user_id is null;

alter table public.vocabulary_check_sessions
add column section smallint;

update public.vocabulary_check_sessions session
set status = 'abandoned',
    completed_at = coalesce(completed_at, now())
where status in ('active', 'paused');

update public.vocabulary_check_sessions session
set section = item.section
from public.vocabulary_items item
where item.id = session.item_ids[1];

alter table public.vocabulary_check_sessions
alter column section set not null;

alter table public.vocabulary_check_sessions
add constraint vocabulary_check_sessions_section_check
check (
  (kind = 'word' and section between 1 and 19)
  or (kind = 'idiom' and section between 1 and 17)
);

alter table public.vocabulary_memory_sessions
add column kind text,
add column section smallint;

update public.vocabulary_memory_sessions session
set status = 'abandoned',
    completed_at = coalesce(completed_at, now())
where status = 'active';

update public.vocabulary_memory_sessions session
set kind = item.kind,
    section = item.section
from public.vocabulary_items item
where item.id = session.initial_item_ids[1];

alter table public.vocabulary_memory_sessions
alter column kind set not null,
alter column section set not null;

alter table public.vocabulary_memory_sessions
add constraint vocabulary_memory_sessions_kind_check
check (kind in ('word', 'idiom')),
add constraint vocabulary_memory_sessions_section_check
check (
  (kind = 'word' and section between 1 and 19)
  or (kind = 'idiom' and section between 1 and 17)
);

create or replace function public.start_vocabulary_check_section_session(
  p_user_id uuid,
  p_kind text,
  p_section smallint,
  p_mode text,
  p_recheck_ratings text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_item_ids bigint[];
begin
  if p_kind not in ('word', 'idiom') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_kind';
  end if;
  if (p_kind = 'word' and p_section not between 1 and 19)
     or (p_kind = 'idiom' and p_section not between 1 and 17) then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_section';
  end if;
  if p_mode not in ('continue', 'restart', 'recheck') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_mode';
  end if;
  if p_mode = 'recheck'
     and coalesce(cardinality(p_recheck_ratings), 0) = 0 then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_rating';
  end if;

  update public.vocabulary_check_sessions
  set status = 'abandoned', completed_at = now()
  where user_id = p_user_id
    and kind = p_kind
    and status in ('active', 'paused');

  select coalesce(
    array_agg(candidate.id order by candidate.sort_key),
    '{}'::bigint[]
  )
  into v_item_ids
  from (
    select
      item.id,
      case
        when p_mode = 'recheck'
          then md5(item.id::text || v_session_id::text)
        else lpad(item.source_order::text, 10, '0')
      end as sort_key
    from public.vocabulary_items item
    left join public.vocabulary_classifications current
      on current.item_id = item.id and current.user_id = p_user_id
    where item.owner_user_id is null
      and item.kind = p_kind
      and item.section = p_section
      and (
        p_mode = 'restart'
        or (p_mode = 'continue' and current.item_id is null)
        or (
          p_mode = 'recheck'
          and current.rating = any(p_recheck_ratings)
        )
      )
  ) candidate;

  if cardinality(v_item_ids) = 0 then
    raise exception using errcode = 'P0002', message = 'vocabulary_queue_empty';
  end if;

  insert into public.vocabulary_check_sessions (
    id, user_id, kind, section, mode, status, item_ids
  ) values (
    v_session_id, p_user_id, p_kind, p_section, p_mode, 'active', v_item_ids
  );

  return v_session_id;
end;
$$;

create or replace function public.start_vocabulary_memory_section_session(
  p_user_id uuid,
  p_kind text,
  p_section smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_item_ids bigint[];
begin
  if p_kind not in ('word', 'idiom') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_kind';
  end if;
  if (p_kind = 'word' and p_section not between 1 and 19)
     or (p_kind = 'idiom' and p_section not between 1 and 17) then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_section';
  end if;

  select id into v_existing_id
  from public.vocabulary_memory_sessions
  where user_id = p_user_id
    and kind = p_kind
    and section = p_section
    and status = 'active'
  order by updated_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  update public.vocabulary_memory_sessions
  set status = 'abandoned', completed_at = now()
  where user_id = p_user_id and status = 'active';

  select coalesce(
    array_agg(candidate.id order by candidate.priority, candidate.due_at, candidate.random_key),
    '{}'::bigint[]
  )
  into v_item_ids
  from (
    select
      item.id,
      case
        when progress.item_id is not null and progress.due_at <= now() then 0
        when classification.rating = 'unknown' then 1
        when classification.rating = 'mostly_unknown' then 2
        when classification.item_id is null then 3
        when classification.rating = 'mostly_known' then 4
        else 5
      end as priority,
      coalesce(progress.due_at, '-infinity'::timestamptz) as due_at,
      md5(item.id::text || v_session_id::text) as random_key
    from public.vocabulary_items item
    left join public.vocabulary_classifications classification
      on classification.item_id = item.id
     and classification.user_id = p_user_id
    left join public.vocabulary_memory_progress progress
      on progress.item_id = item.id
     and progress.user_id = p_user_id
    where item.owner_user_id is null
      and item.kind = p_kind
      and item.section = p_section
      and (progress.item_id is null or progress.due_at <= now())
    order by priority, due_at, random_key
    limit 10
  ) candidate;

  if cardinality(v_item_ids) = 0 then
    raise exception using
      errcode = 'P0002',
      message = 'vocabulary_memory_queue_empty';
  end if;

  insert into public.vocabulary_memory_sessions (
    id, user_id, kind, section, initial_item_ids, queue_ids
  ) values (
    v_session_id, p_user_id, p_kind, p_section, v_item_ids, v_item_ids
  );

  return v_session_id;
end;
$$;

-- Keep the previous bridge release functional during a rolling deployment.
create or replace function public.start_vocabulary_check_session(
  p_user_id uuid,
  p_kind text,
  p_mode text,
  p_skipped_sections smallint[],
  p_recheck_ratings text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section smallint;
begin
  select candidate::smallint
  into v_section
  from generate_series(1, case when p_kind = 'idiom' then 17 else 19 end) candidate
  where not (candidate::smallint = any(coalesce(p_skipped_sections, '{}'::smallint[])))
  order by candidate
  limit 1;

  return public.start_vocabulary_check_section_session(
    p_user_id,
    p_kind,
    coalesce(v_section, 1::smallint),
    p_mode,
    p_recheck_ratings
  );
end;
$$;

create or replace function public.start_vocabulary_memory_session(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.start_vocabulary_memory_section_session(
    p_user_id,
    'word',
    1::smallint
  );
$$;

create or replace function public.get_vocabulary_check_overview(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with counts as (
    select
      item.kind,
      count(*)::integer as total,
      count(current.item_id)::integer as classified,
      count(*) filter (where current.rating = 'mastered')::integer as mastered,
      count(*) filter (where current.rating = 'mostly_known')::integer as mostly_known,
      count(*) filter (where current.rating = 'mostly_unknown')::integer as mostly_unknown,
      count(*) filter (where current.rating = 'unknown')::integer as unknown
    from public.vocabulary_items item
    left join public.vocabulary_classifications current
      on current.item_id = item.id and current.user_id = p_user_id
    where item.owner_user_id is null
    group by item.kind
  ), resumable as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'kind', kind,
          'section', section,
          'mode', mode,
          'position', current_index,
          'total', cardinality(item_ids)
        ) order by updated_at desc
      ),
      '[]'::jsonb
    ) as sessions
    from public.vocabulary_check_sessions
    where user_id = p_user_id and status in ('active', 'paused')
  )
  select jsonb_build_object(
    'words', jsonb_build_object(
      'total', coalesce((select total from counts where kind = 'word'), 0),
      'classified', coalesce((select classified from counts where kind = 'word'), 0),
      'unclassified', coalesce((select total - classified from counts where kind = 'word'), 0),
      'mastered', coalesce((select mastered from counts where kind = 'word'), 0),
      'mostlyKnown', coalesce((select mostly_known from counts where kind = 'word'), 0),
      'mostlyUnknown', coalesce((select mostly_unknown from counts where kind = 'word'), 0),
      'unknown', coalesce((select unknown from counts where kind = 'word'), 0)
    ),
    'idioms', jsonb_build_object(
      'total', coalesce((select total from counts where kind = 'idiom'), 0),
      'classified', coalesce((select classified from counts where kind = 'idiom'), 0),
      'unclassified', coalesce((select total - classified from counts where kind = 'idiom'), 0),
      'mastered', coalesce((select mastered from counts where kind = 'idiom'), 0),
      'mostlyKnown', coalesce((select mostly_known from counts where kind = 'idiom'), 0),
      'mostlyUnknown', coalesce((select mostly_unknown from counts where kind = 'idiom'), 0),
      'unknown', coalesce((select unknown from counts where kind = 'idiom'), 0)
    ),
    'lastCheckedAt', (
      select max(updated_at)
      from public.vocabulary_classifications
      where user_id = p_user_id
    ),
    'resumableSessions', (select sessions from resumable)
  );
$$;

revoke all on function public.start_vocabulary_check_section_session(
  uuid, text, smallint, text, text[]
) from anon, authenticated, public;
revoke all on function public.start_vocabulary_memory_section_session(
  uuid, text, smallint
) from anon, authenticated, public;

grant execute on function public.start_vocabulary_check_section_session(
  uuid, text, smallint, text, text[]
) to service_role;
grant execute on function public.start_vocabulary_memory_section_session(
  uuid, text, smallint
) to service_role;
