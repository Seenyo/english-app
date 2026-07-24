-- Restore whole-list check modes alongside the newer section-scoped mode.

alter table public.vocabulary_check_sessions
alter column section drop not null;

alter table public.vocabulary_check_sessions
drop constraint vocabulary_check_sessions_section_check;

alter table public.vocabulary_check_sessions
add constraint vocabulary_check_sessions_section_check
check (
  section is null
  or (kind = 'word' and section between 1 and 19)
  or (kind = 'idiom' and section between 1 and 17)
);

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
  v_session_id uuid := gen_random_uuid();
  v_item_ids bigint[];
  v_item record;
  v_previous public.vocabulary_classifications%rowtype;
begin
  if p_kind not in ('word', 'idiom') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_kind';
  end if;
  if p_mode not in ('continue', 'restart', 'recheck') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_mode';
  end if;
  if p_kind = 'idiom'
     and cardinality(coalesce(p_skipped_sections, '{}'::smallint[])) > 0 then
    raise exception using errcode = '22023', message = 'idioms_have_no_sections';
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

  if p_kind = 'word'
     and p_mode = 'restart'
     and cardinality(coalesce(p_skipped_sections, '{}'::smallint[])) > 0 then
    for v_item in
      select id
      from public.vocabulary_items
      where owner_user_id is null
        and kind = 'word'
        and section = any(p_skipped_sections)
    loop
      select *
      into v_previous
      from public.vocabulary_classifications
      where user_id = p_user_id and item_id = v_item.id;

      insert into public.vocabulary_classification_operations (
        id,
        user_id,
        item_id,
        action,
        rating,
        source,
        previous_rating,
        previous_source
      ) values (
        gen_random_uuid(),
        p_user_id,
        v_item.id,
        'classify',
        'mastered',
        'section_skip',
        v_previous.rating,
        v_previous.source
      );

      insert into public.vocabulary_classifications (
        user_id,
        item_id,
        rating,
        source,
        session_id,
        classified_at
      ) values (
        p_user_id,
        v_item.id,
        'mastered',
        'section_skip',
        null,
        now()
      )
      on conflict (user_id, item_id) do update
      set rating = excluded.rating,
          source = excluded.source,
          session_id = null,
          classified_at = excluded.classified_at;
    end loop;
  end if;

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
      and (
        (p_mode = 'continue' and current.item_id is null)
        or (
          p_mode = 'restart'
          and not (
            p_kind = 'word'
            and item.section = any(
              coalesce(p_skipped_sections, '{}'::smallint[])
            )
          )
        )
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
    id,
    user_id,
    kind,
    section,
    mode,
    status,
    item_ids
  ) values (
    v_session_id,
    p_user_id,
    p_kind,
    null,
    p_mode,
    'active',
    v_item_ids
  );

  return v_session_id;
end;
$$;

revoke all on function public.start_vocabulary_check_session(
  uuid, text, text, smallint[], text[]
) from anon, authenticated, public;

grant execute on function public.start_vocabulary_check_session(
  uuid, text, text, smallint[], text[]
) to service_role;
