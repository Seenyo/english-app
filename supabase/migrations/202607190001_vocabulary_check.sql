-- Shared vocabulary masters and per-user, resumable four-way familiarity checks.
-- All browser access goes through the allowlisted local bridge.

create table if not exists vocabulary_items (
  id                  bigint generated always as identity primary key,
  item_key            text not null unique,
  owner_user_id       uuid references auth.users(id) on delete cascade,
  kind                text not null check (kind in ('word', 'idiom')),
  source_name         text not null,
  source_version      text not null,
  source_order        integer not null check (source_order > 0),
  term                text not null check (char_length(term) between 1 and 300),
  meaning_ja          text not null check (char_length(meaning_ja) between 1 and 2400),
  section             smallint check (section between 1 and 19),
  part                smallint check (part between 1 and 3),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (
    (kind = 'word' and section is not null and part is not null)
    or (kind = 'idiom' and section is null and part is null)
  )
);

create table if not exists vocabulary_check_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  kind                text not null check (kind in ('word', 'idiom')),
  mode                text not null check (mode in ('continue', 'restart', 'recheck')),
  status              text not null default 'active'
                      check (status in ('active', 'paused', 'completed', 'abandoned')),
  item_ids            bigint[] not null check (cardinality(item_ids) > 0),
  current_index       integer not null default 0 check (current_index >= 0),
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  check (current_index <= cardinality(item_ids))
);

create unique index if not exists vocabulary_one_resumable_session_per_kind
  on vocabulary_check_sessions(user_id, kind)
  where status in ('active', 'paused');

create table if not exists vocabulary_classifications (
  user_id             uuid not null references auth.users(id) on delete cascade,
  item_id             bigint not null references vocabulary_items(id) on delete cascade,
  rating              text not null
                      check (rating in ('mastered', 'mostly_known', 'mostly_unknown', 'unknown')),
  source              text not null check (source in ('swipe', 'section_skip')),
  session_id          uuid references vocabulary_check_sessions(id) on delete set null,
  classified_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists vocabulary_classification_operations (
  id                  uuid primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  session_id          uuid references vocabulary_check_sessions(id) on delete cascade,
  item_id             bigint not null references vocabulary_items(id) on delete cascade,
  action              text not null check (action in ('classify', 'undo')),
  rating              text check (rating in ('mastered', 'mostly_known', 'mostly_unknown', 'unknown')),
  source              text not null check (source in ('swipe', 'section_skip', 'undo')),
  previous_rating     text check (previous_rating in ('mastered', 'mostly_known', 'mostly_unknown', 'unknown')),
  previous_source     text check (previous_source in ('swipe', 'section_skip')),
  target_operation_id uuid references vocabulary_classification_operations(id),
  reverted_at         timestamptz,
  created_at          timestamptz not null default now(),
  check (
    (action = 'classify' and rating is not null and target_operation_id is null)
    or (action = 'undo' and rating is null and target_operation_id is not null)
  )
);

create index if not exists vocabulary_items_kind_order_idx
  on vocabulary_items(kind, source_order);
create index if not exists vocabulary_classifications_user_rating_idx
  on vocabulary_classifications(user_id, rating);
create index if not exists vocabulary_operations_user_created_idx
  on vocabulary_classification_operations(user_id, created_at desc);
create index if not exists vocabulary_sessions_user_started_idx
  on vocabulary_check_sessions(user_id, started_at desc);

drop trigger if exists vocabulary_items_set_updated_at on vocabulary_items;
create trigger vocabulary_items_set_updated_at
before update on vocabulary_items
for each row execute function set_updated_at();

drop trigger if exists vocabulary_sessions_set_updated_at on vocabulary_check_sessions;
create trigger vocabulary_sessions_set_updated_at
before update on vocabulary_check_sessions
for each row execute function set_updated_at();

drop trigger if exists vocabulary_classifications_set_updated_at on vocabulary_classifications;
create trigger vocabulary_classifications_set_updated_at
before update on vocabulary_classifications
for each row execute function set_updated_at();

alter table vocabulary_items enable row level security;
alter table vocabulary_items force row level security;
alter table vocabulary_check_sessions enable row level security;
alter table vocabulary_check_sessions force row level security;
alter table vocabulary_classifications enable row level security;
alter table vocabulary_classifications force row level security;
alter table vocabulary_classification_operations enable row level security;
alter table vocabulary_classification_operations force row level security;

revoke all on vocabulary_items from anon, authenticated, public;
revoke all on vocabulary_check_sessions from anon, authenticated, public;
revoke all on vocabulary_classifications from anon, authenticated, public;
revoke all on vocabulary_classification_operations from anon, authenticated, public;

grant all on vocabulary_items to service_role;
grant all on vocabulary_check_sessions to service_role;
grant all on vocabulary_classifications to service_role;
grant all on vocabulary_classification_operations to service_role;
grant usage, select on sequence vocabulary_items_id_seq to service_role;

create or replace function start_vocabulary_check_session(
  p_user_id uuid,
  p_kind text,
  p_mode text,
  p_skipped_sections smallint[],
  p_recheck_ratings text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_item_ids bigint[];
  v_item record;
  v_previous vocabulary_classifications%rowtype;
begin
  if p_kind not in ('word', 'idiom') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_kind';
  end if;
  if p_mode not in ('continue', 'restart', 'recheck') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_mode';
  end if;
  if p_kind = 'idiom' and cardinality(p_skipped_sections) > 0 then
    raise exception using errcode = '22023', message = 'idioms_have_no_sections';
  end if;

  update vocabulary_check_sessions
  set status = 'abandoned', completed_at = now()
  where user_id = p_user_id
    and kind = p_kind
    and status in ('active', 'paused');

  if p_kind = 'word' and p_mode = 'restart' and cardinality(p_skipped_sections) > 0 then
    for v_item in
      select id from vocabulary_items
      where owner_user_id is null
        and kind = 'word'
        and section = any(p_skipped_sections)
    loop
      select * into v_previous
      from vocabulary_classifications
      where user_id = p_user_id and item_id = v_item.id;

      insert into vocabulary_classification_operations (
        id, user_id, item_id, action, rating, source,
        previous_rating, previous_source
      ) values (
        gen_random_uuid(), p_user_id, v_item.id, 'classify', 'mastered',
        'section_skip', v_previous.rating, v_previous.source
      );

      insert into vocabulary_classifications (
        user_id, item_id, rating, source, classified_at
      ) values (
        p_user_id, v_item.id, 'mastered', 'section_skip', now()
      )
      on conflict (user_id, item_id) do update
      set rating = excluded.rating,
          source = excluded.source,
          session_id = null,
          classified_at = excluded.classified_at;
    end loop;
  end if;

  select coalesce(array_agg(candidate.id order by candidate.sort_key), '{}'::bigint[])
  into v_item_ids
  from (
    select
      item.id,
      case
        when p_mode = 'recheck' then md5(item.id::text || v_session_id::text)
        else lpad(item.source_order::text, 10, '0')
      end as sort_key
    from vocabulary_items item
    left join vocabulary_classifications current
      on current.item_id = item.id and current.user_id = p_user_id
    where item.owner_user_id is null
      and item.kind = p_kind
      and (
        (p_mode = 'continue' and current.item_id is null)
        or (
          p_mode = 'restart'
          and not (
            p_kind = 'word'
            and item.section = any(p_skipped_sections)
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

  insert into vocabulary_check_sessions (
    id, user_id, kind, mode, status, item_ids
  ) values (
    v_session_id, p_user_id, p_kind, p_mode, 'active', v_item_ids
  );
  return v_session_id;
end;
$$;

create or replace function apply_vocabulary_operations(
  p_user_id uuid,
  p_session_id uuid,
  p_operations jsonb,
  p_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session vocabulary_check_sessions%rowtype;
  v_operation jsonb;
  v_operation_id uuid;
  v_item_id bigint;
  v_rating text;
  v_target_id uuid;
  v_target vocabulary_classification_operations%rowtype;
  v_previous vocabulary_classifications%rowtype;
  v_working_position integer;
begin
  select * into v_session
  from vocabulary_check_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'vocabulary_session_not_found';
  end if;
  if jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_operations';
  end if;
  if p_position < 0 or p_position > cardinality(v_session.item_ids) then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_position';
  end if;
  if v_session.status not in ('active', 'paused') then
    raise exception using errcode = '22023', message = 'vocabulary_session_not_resumable';
  end if;
  v_working_position := v_session.current_index;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_operation_id := (v_operation->>'id')::uuid;
    if exists (
      select 1 from vocabulary_classification_operations
      where id = v_operation_id and user_id = p_user_id
    ) then
      continue;
    end if;
    v_item_id := (v_operation->>'itemId')::bigint;
    if not (v_item_id = any(v_session.item_ids)) then
      raise exception using errcode = '22023', message = 'item_not_in_vocabulary_session';
    end if;

    if v_operation->>'action' = 'classify' then
      if v_working_position >= cardinality(v_session.item_ids)
         or v_session.item_ids[v_working_position + 1] <> v_item_id then
        raise exception using errcode = '22023', message = 'vocabulary_operation_out_of_order';
      end if;
      v_rating := v_operation->>'rating';
      if v_rating not in ('mastered', 'mostly_known', 'mostly_unknown', 'unknown') then
        raise exception using errcode = '22023', message = 'invalid_vocabulary_rating';
      end if;
      v_previous := null;
      select * into v_previous
      from vocabulary_classifications
      where user_id = p_user_id and item_id = v_item_id;

      insert into vocabulary_classification_operations (
        id, user_id, session_id, item_id, action, rating, source,
        previous_rating, previous_source
      ) values (
        v_operation_id, p_user_id, p_session_id, v_item_id,
        'classify', v_rating, 'swipe', v_previous.rating, v_previous.source
      );
      insert into vocabulary_classifications (
        user_id, item_id, rating, source, session_id, classified_at
      ) values (
        p_user_id, v_item_id, v_rating, 'swipe', p_session_id, now()
      )
      on conflict (user_id, item_id) do update
      set rating = excluded.rating,
          source = excluded.source,
          session_id = excluded.session_id,
          classified_at = excluded.classified_at;
      v_working_position := v_working_position + 1;
    elsif v_operation->>'action' = 'undo' then
      if v_working_position <= 0
         or v_session.item_ids[v_working_position] <> v_item_id then
        raise exception using errcode = '22023', message = 'vocabulary_undo_out_of_order';
      end if;
      v_target_id := (v_operation->>'targetOperationId')::uuid;
      select * into v_target
      from vocabulary_classification_operations
      where id = v_target_id
        and user_id = p_user_id
        and session_id = p_session_id
        and item_id = v_item_id
        and action = 'classify'
      for update;
      if not found or v_target.reverted_at is not null then
        raise exception using errcode = 'P0002', message = 'undo_target_not_found';
      end if;

      insert into vocabulary_classification_operations (
        id, user_id, session_id, item_id, action, source, target_operation_id
      ) values (
        v_operation_id, p_user_id, p_session_id, v_item_id,
        'undo', 'undo', v_target_id
      );
      if v_target.previous_rating is null then
        delete from vocabulary_classifications
        where user_id = p_user_id and item_id = v_item_id;
      else
        insert into vocabulary_classifications (
          user_id, item_id, rating, source, session_id, classified_at
        ) values (
          p_user_id, v_item_id, v_target.previous_rating,
          v_target.previous_source, p_session_id, now()
        )
        on conflict (user_id, item_id) do update
        set rating = excluded.rating,
            source = excluded.source,
            session_id = excluded.session_id,
            classified_at = excluded.classified_at;
      end if;
      update vocabulary_classification_operations
      set reverted_at = now()
      where id = v_target_id;
      v_working_position := v_working_position - 1;
    else
      raise exception using errcode = '22023', message = 'invalid_vocabulary_action';
    end if;
  end loop;

  if p_position <> v_working_position then
    raise exception using errcode = '22023', message = 'vocabulary_position_mismatch';
  end if;

  update vocabulary_check_sessions
  set current_index = p_position, status = 'active'
  where id = p_session_id;
end;
$$;

create or replace function finish_vocabulary_check_session(
  p_user_id uuid,
  p_session_id uuid,
  p_status text,
  p_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session vocabulary_check_sessions%rowtype;
begin
  if p_status not in ('paused', 'completed') then
    raise exception using errcode = '22023', message = 'invalid_vocabulary_session_status';
  end if;

  select * into v_session
  from vocabulary_check_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'vocabulary_session_not_found';
  end if;
  if v_session.status = 'completed' then
    if p_status = 'completed' and p_position = v_session.current_index then
      return;
    end if;
    raise exception using errcode = '22023', message = 'vocabulary_session_not_resumable';
  end if;
  if p_position <> v_session.current_index then
    raise exception using errcode = '22023', message = 'vocabulary_position_mismatch';
  end if;
  if p_status = 'completed'
     and v_session.current_index <> cardinality(v_session.item_ids) then
    raise exception using errcode = '22023', message = 'vocabulary_session_incomplete';
  end if;

  update vocabulary_check_sessions
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end
  where id = p_session_id;
end;
$$;

create or replace function get_vocabulary_check_overview(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
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
    from vocabulary_items item
    left join vocabulary_classifications current
      on current.item_id = item.id and current.user_id = p_user_id
    where item.owner_user_id is null
    group by item.kind
  ), resumable as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'kind', kind,
          'mode', mode,
          'position', current_index,
          'total', cardinality(item_ids)
        ) order by updated_at desc
      ),
      '[]'::jsonb
    ) as sessions
    from vocabulary_check_sessions
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
      select max(updated_at) from vocabulary_classifications where user_id = p_user_id
    ),
    'resumableSessions', (select sessions from resumable)
  );
$$;

revoke all on function start_vocabulary_check_session(uuid, text, text, smallint[], text[]) from anon, authenticated, public;
revoke all on function apply_vocabulary_operations(uuid, uuid, jsonb, integer) from anon, authenticated, public;
revoke all on function finish_vocabulary_check_session(uuid, uuid, text, integer) from anon, authenticated, public;
revoke all on function get_vocabulary_check_overview(uuid) from anon, authenticated, public;
grant execute on function start_vocabulary_check_session(uuid, text, text, smallint[], text[]) to service_role;
grant execute on function apply_vocabulary_operations(uuid, uuid, jsonb, integer) to service_role;
grant execute on function finish_vocabulary_check_session(uuid, uuid, text, integer) to service_role;
grant execute on function get_vocabulary_check_overview(uuid) to service_role;
