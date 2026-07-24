-- Lightweight, adaptive vocabulary memorization.
-- The browser talks only to the allowlisted AI bridge; all public objects are
-- restricted to service_role and every per-user table has forced RLS.

create table vocabulary_memory_progress (
  user_id             uuid not null references auth.users(id) on delete cascade,
  item_id             bigint not null references vocabulary_items(id) on delete cascade,
  interval_days       smallint not null default 0
                      check (interval_days between 0 and 3650),
  success_streak      smallint not null default 0
                      check (success_streak between 0 and 32767),
  review_count        integer not null default 0 check (review_count >= 0),
  remembered_count    integer not null default 0 check (remembered_count >= 0),
  again_count         integer not null default 0 check (again_count >= 0),
  last_result         text not null check (last_result in ('remembered', 'again')),
  last_reviewed_at    timestamptz not null default now(),
  due_at              timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table vocabulary_memory_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'active'
                      check (status in ('active', 'completed', 'abandoned')),
  initial_item_ids    bigint[] not null
                      check (cardinality(initial_item_ids) between 1 and 10),
  queue_ids           bigint[] not null check (cardinality(queue_ids) >= 1),
  current_index       integer not null default 0 check (current_index >= 0),
  remembered_item_ids bigint[] not null default '{}'::bigint[],
  again_item_ids      bigint[] not null default '{}'::bigint[],
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  check (current_index <= cardinality(queue_ids))
);

create table vocabulary_memory_reviews (
  id                  uuid primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  session_id          uuid not null references vocabulary_memory_sessions(id) on delete cascade,
  item_id             bigint not null references vocabulary_items(id) on delete cascade,
  result              text not null check (result in ('remembered', 'again')),
  attempt_number      smallint not null check (attempt_number between 1 and 3),
  response_ms         integer not null check (response_ms between 0 and 600000),
  reviewed_at         timestamptz not null default now(),
  unique (session_id, item_id, attempt_number)
);

create unique index vocabulary_one_active_memory_session_per_user
  on vocabulary_memory_sessions(user_id)
  where status = 'active';

create index vocabulary_memory_progress_due_idx
  on vocabulary_memory_progress(user_id, due_at);
create index vocabulary_memory_sessions_user_completed_idx
  on vocabulary_memory_sessions(user_id, completed_at desc)
  where status = 'completed';
create index vocabulary_memory_reviews_user_reviewed_idx
  on vocabulary_memory_reviews(user_id, reviewed_at desc);
create index vocabulary_memory_reviews_session_idx
  on vocabulary_memory_reviews(session_id);
create index vocabulary_memory_reviews_item_idx
  on vocabulary_memory_reviews(item_id);

drop trigger if exists vocabulary_memory_progress_set_updated_at
  on vocabulary_memory_progress;
create trigger vocabulary_memory_progress_set_updated_at
before update on vocabulary_memory_progress
for each row execute function set_updated_at();

drop trigger if exists vocabulary_memory_sessions_set_updated_at
  on vocabulary_memory_sessions;
create trigger vocabulary_memory_sessions_set_updated_at
before update on vocabulary_memory_sessions
for each row execute function set_updated_at();

alter table vocabulary_memory_progress enable row level security;
alter table vocabulary_memory_progress force row level security;
alter table vocabulary_memory_sessions enable row level security;
alter table vocabulary_memory_sessions force row level security;
alter table vocabulary_memory_reviews enable row level security;
alter table vocabulary_memory_reviews force row level security;

revoke all on vocabulary_memory_progress from anon, authenticated, public;
revoke all on vocabulary_memory_sessions from anon, authenticated, public;
revoke all on vocabulary_memory_reviews from anon, authenticated, public;

grant select, insert, update on vocabulary_memory_progress to service_role;
grant select, insert, update on vocabulary_memory_sessions to service_role;
grant select, insert on vocabulary_memory_reviews to service_role;

create or replace function start_vocabulary_memory_session(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_item_ids bigint[];
begin
  select id into v_existing_id
  from vocabulary_memory_sessions
  where user_id = p_user_id and status = 'active'
  order by updated_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  with candidate_pool as (
    select
      item.id,
      item.kind,
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
    from vocabulary_items item
    left join vocabulary_classifications classification
      on classification.item_id = item.id
     and classification.user_id = p_user_id
    left join vocabulary_memory_progress progress
      on progress.item_id = item.id
     and progress.user_id = p_user_id
    where item.owner_user_id is null
      and (progress.item_id is null or progress.due_at <= now())
  ), ranked as (
    select
      *,
      row_number() over (
        partition by kind
        order by priority, due_at, random_key
      ) as kind_rank
    from candidate_pool
  ), preferred as (
    select * from ranked
    where (kind = 'word' and kind_rank <= 7)
       or (kind = 'idiom' and kind_rank <= 3)
  ), selected as (
    select id, priority, due_at, random_key, 0 as fill_order
    from preferred
    union all
    select id, priority, due_at, random_key, 1 as fill_order
    from ranked
    where id not in (select id from preferred)
    order by fill_order, priority, due_at, random_key
    limit 10
  )
  select array_agg(id order by fill_order, priority, due_at, random_key)
  into v_item_ids
  from selected;

  if coalesce(cardinality(v_item_ids), 0) = 0 then
    raise exception using
      errcode = 'P0002',
      message = 'vocabulary_memory_queue_empty';
  end if;

  insert into vocabulary_memory_sessions (
    id,
    user_id,
    initial_item_ids,
    queue_ids
  ) values (
    v_session_id,
    p_user_id,
    v_item_ids,
    v_item_ids
  );

  return v_session_id;
end;
$$;

create or replace function answer_vocabulary_memory_card(
  p_user_id uuid,
  p_session_id uuid,
  p_operation_id uuid,
  p_item_id bigint,
  p_result text,
  p_response_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session vocabulary_memory_sessions%rowtype;
  v_progress vocabulary_memory_progress%rowtype;
  v_had_progress boolean;
  v_attempt_number smallint;
  v_interval smallint;
  v_queue bigint[];
  v_next_index integer;
  v_remembered bigint[];
  v_again bigint[];
begin
  if p_result not in ('remembered', 'again') then
    raise exception using errcode = '22023', message = 'invalid_memory_result';
  end if;
  if p_response_ms < 0 or p_response_ms > 600000 then
    raise exception using errcode = '22023', message = 'invalid_memory_response_time';
  end if;

  if exists (
    select 1
    from vocabulary_memory_reviews
    where id = p_operation_id
      and user_id = p_user_id
      and session_id = p_session_id
  ) then
    return p_session_id;
  end if;

  select * into v_session
  from vocabulary_memory_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'memory_session_not_found';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '22023', message = 'memory_session_not_active';
  end if;
  if v_session.current_index >= cardinality(v_session.queue_ids)
     or v_session.queue_ids[v_session.current_index + 1] <> p_item_id then
    raise exception using errcode = '22023', message = 'memory_item_out_of_order';
  end if;

  select (count(*) + 1)::smallint into v_attempt_number
  from vocabulary_memory_reviews
  where session_id = p_session_id and item_id = p_item_id;

  if v_attempt_number > 3 then
    raise exception using errcode = '22023', message = 'memory_attempt_limit_reached';
  end if;

  insert into vocabulary_memory_reviews (
    id,
    user_id,
    session_id,
    item_id,
    result,
    attempt_number,
    response_ms
  ) values (
    p_operation_id,
    p_user_id,
    p_session_id,
    p_item_id,
    p_result,
    v_attempt_number,
    p_response_ms
  );

  select * into v_progress
  from vocabulary_memory_progress
  where user_id = p_user_id and item_id = p_item_id
  for update;
  v_had_progress := found;

  if p_result = 'remembered' then
    v_interval := case
      when not v_had_progress or v_progress.last_result = 'again' then 1
      when v_progress.interval_days < 1 then 1
      when v_progress.interval_days = 1 then 3
      when v_progress.interval_days <= 3 then 7
      when v_progress.interval_days <= 7 then 14
      when v_progress.interval_days <= 14 then 30
      else least(3650, ceil(v_progress.interval_days * 1.8)::integer)
    end;

    insert into vocabulary_memory_progress (
      user_id,
      item_id,
      interval_days,
      success_streak,
      review_count,
      remembered_count,
      again_count,
      last_result,
      last_reviewed_at,
      due_at
    ) values (
      p_user_id,
      p_item_id,
      v_interval,
      1,
      1,
      1,
      0,
      'remembered',
      now(),
      now() + make_interval(days => v_interval)
    )
    on conflict (user_id, item_id) do update
    set interval_days = v_interval,
        success_streak = vocabulary_memory_progress.success_streak + 1,
        review_count = vocabulary_memory_progress.review_count + 1,
        remembered_count = vocabulary_memory_progress.remembered_count + 1,
        last_result = 'remembered',
        last_reviewed_at = now(),
        due_at = now() + make_interval(days => v_interval);
  else
    insert into vocabulary_memory_progress (
      user_id,
      item_id,
      interval_days,
      success_streak,
      review_count,
      remembered_count,
      again_count,
      last_result,
      last_reviewed_at,
      due_at
    ) values (
      p_user_id,
      p_item_id,
      0,
      0,
      1,
      0,
      1,
      'again',
      now(),
      now() + interval '1 day'
    )
    on conflict (user_id, item_id) do update
    set interval_days = 0,
        success_streak = 0,
        review_count = vocabulary_memory_progress.review_count + 1,
        again_count = vocabulary_memory_progress.again_count + 1,
        last_result = 'again',
        last_reviewed_at = now(),
        due_at = now() + interval '1 day';
  end if;

  v_queue := v_session.queue_ids;
  if p_result = 'again' and v_attempt_number < 3 then
    v_queue := array_append(v_queue, p_item_id);
  end if;

  v_remembered := case
    when p_result = 'remembered' then
      array_append(array_remove(v_session.remembered_item_ids, p_item_id), p_item_id)
    else array_remove(v_session.remembered_item_ids, p_item_id)
  end;
  v_again := case
    when p_result = 'again' then
      array_append(array_remove(v_session.again_item_ids, p_item_id), p_item_id)
    else array_remove(v_session.again_item_ids, p_item_id)
  end;
  v_next_index := v_session.current_index + 1;

  update vocabulary_memory_sessions
  set queue_ids = v_queue,
      current_index = v_next_index,
      remembered_item_ids = v_remembered,
      again_item_ids = v_again,
      status = case
        when v_next_index >= cardinality(v_queue) then 'completed'
        else 'active'
      end,
      completed_at = case
        when v_next_index >= cardinality(v_queue) then now()
        else null
      end
  where id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function get_vocabulary_memory_overview(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with candidate_count as (
    select count(*)::integer as total
    from vocabulary_items item
    left join vocabulary_memory_progress progress
      on progress.item_id = item.id and progress.user_id = p_user_id
    where item.owner_user_id is null
      and (progress.item_id is null or progress.due_at <= now())
  ), completed_dates as (
    select distinct timezone('Asia/Tokyo', completed_at)::date as study_date
    from vocabulary_memory_sessions
    where user_id = p_user_id
      and status = 'completed'
      and completed_at is not null
  ), streak_anchor as (
    select max(study_date) as latest_date
    from completed_dates
  ), numbered_dates as (
    select
      study_date,
      row_number() over (order by study_date desc)::integer as position
    from completed_dates
  ), streak as (
    select case
      when anchor.latest_date is null
        or anchor.latest_date < timezone('Asia/Tokyo', now())::date - 1
      then 0
      else count(*) filter (
        where dates.study_date = anchor.latest_date - (dates.position - 1)
      )::integer
    end as days
    from numbered_dates dates
    cross join streak_anchor anchor
    group by anchor.latest_date
  )
  select jsonb_build_object(
    'recommendedCount', least(10, (select total from candidate_count)),
    'estimatedMinutes', case
      when (select total from candidate_count) = 0 then 0
      else greatest(1, ceil(least(10, (select total from candidate_count)) * 18.0 / 60.0)::integer)
    end,
    'streakDays', coalesce((select days from streak), 0),
    'hasActiveSession', exists (
      select 1
      from vocabulary_memory_sessions
      where user_id = p_user_id and status = 'active'
    ),
    'lastMemorizedAt', (
      select max(completed_at)
      from vocabulary_memory_sessions
      where user_id = p_user_id and status = 'completed'
    )
  );
$$;

revoke all on function start_vocabulary_memory_session(uuid)
  from anon, authenticated, public;
revoke all on function answer_vocabulary_memory_card(uuid, uuid, uuid, bigint, text, integer)
  from anon, authenticated, public;
revoke all on function get_vocabulary_memory_overview(uuid)
  from anon, authenticated, public;

grant execute on function start_vocabulary_memory_session(uuid)
  to service_role;
grant execute on function answer_vocabulary_memory_card(uuid, uuid, uuid, bigint, text, integer)
  to service_role;
grant execute on function get_vocabulary_memory_overview(uuid)
  to service_role;
