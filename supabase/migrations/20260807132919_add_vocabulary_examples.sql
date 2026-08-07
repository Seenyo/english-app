-- Shared, GLM-generated vocabulary examples and audited source corrections.
-- Browser clients cannot access these tables directly; the trusted bridge uses
-- the service role and returns only validated projections.

create table public.vocabulary_examples (
  item_id             bigint not null
                      references public.vocabulary_items(id) on delete cascade,
  position            smallint not null check (position between 1 and 3),
  english             text not null check (char_length(english) between 1 and 1200),
  japanese            text not null check (char_length(japanese) between 1 and 1200),
  generation_model    text not null check (char_length(generation_model) between 1 and 200),
  qa_model            text not null check (char_length(qa_model) between 1 and 200),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (item_id, position)
);

create table public.vocabulary_source_corrections (
  item_id               bigint primary key
                        references public.vocabulary_items(id) on delete cascade,
  original_meaning_ja   text not null
                        check (char_length(original_meaning_ja) between 1 and 2400),
  corrected_meaning_ja  text not null
                        check (char_length(corrected_meaning_ja) between 1 and 2400),
  reason_ja              text not null check (char_length(reason_ja) between 1 and 4000),
  qa_model               text not null check (char_length(qa_model) between 1 and 200),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (original_meaning_ja <> corrected_meaning_ja)
);

drop trigger if exists vocabulary_examples_set_updated_at
  on public.vocabulary_examples;
create trigger vocabulary_examples_set_updated_at
before update on public.vocabulary_examples
for each row execute function public.set_updated_at();

drop trigger if exists vocabulary_source_corrections_set_updated_at
  on public.vocabulary_source_corrections;
create trigger vocabulary_source_corrections_set_updated_at
before update on public.vocabulary_source_corrections
for each row execute function public.set_updated_at();

alter table public.vocabulary_examples enable row level security;
alter table public.vocabulary_examples force row level security;
alter table public.vocabulary_source_corrections enable row level security;
alter table public.vocabulary_source_corrections force row level security;

revoke all on table public.vocabulary_examples
  from anon, authenticated, public;
revoke all on table public.vocabulary_source_corrections
  from anon, authenticated, public;

grant select, insert, update, delete on table public.vocabulary_examples
  to service_role;
grant select, insert, update, delete on table public.vocabulary_source_corrections
  to service_role;

create or replace function public.import_vocabulary_example_batch(
  p_entries jsonb,
  p_generation_model text,
  p_qa_model text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_example jsonb;
  v_correction jsonb;
  v_item_id bigint;
  v_position bigint;
  v_item_count integer := 0;
  v_example_count integer := 0;
  v_correction_count integer := 0;
begin
  if jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'invalid_vocabulary_example_batch';
  end if;
  if nullif(btrim(p_generation_model), '') is null
     or nullif(btrim(p_qa_model), '') is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_vocabulary_example_models';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    select item.id
    into v_item_id
    from public.vocabulary_items item
    where item.item_key = v_entry->>'itemKey'
      and item.owner_user_id is null
      and item.kind = v_entry->>'kind'
      and item.source_order = (v_entry->>'sourceOrder')::integer
      and item.term = v_entry->>'term';

    if v_item_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'vocabulary_example_item_not_found',
        detail = coalesce(v_entry->>'itemKey', '<null>');
    end if;
    if jsonb_typeof(v_entry->'examples') <> 'array'
       or jsonb_array_length(v_entry->'examples') <> 3 then
      raise exception using
        errcode = '22023',
        message = 'invalid_vocabulary_example_count',
        detail = v_entry->>'itemKey';
    end if;

    update public.vocabulary_items
    set meaning_ja = v_entry->>'meaningJa'
    where id = v_item_id
      and meaning_ja is distinct from v_entry->>'meaningJa';

    v_correction := v_entry->'sourceCorrection';
    if v_correction is not null and jsonb_typeof(v_correction) = 'object' then
      insert into public.vocabulary_source_corrections (
        item_id,
        original_meaning_ja,
        corrected_meaning_ja,
        reason_ja,
        qa_model
      ) values (
        v_item_id,
        v_correction->>'originalMeaningJa',
        v_correction->>'correctedMeaningJa',
        v_correction->>'reasonJa',
        p_qa_model
      )
      on conflict (item_id) do update
      set original_meaning_ja = excluded.original_meaning_ja,
          corrected_meaning_ja = excluded.corrected_meaning_ja,
          reason_ja = excluded.reason_ja,
          qa_model = excluded.qa_model;
      v_correction_count := v_correction_count + 1;
    end if;

    for v_example, v_position in
      select value, ordinality
      from jsonb_array_elements(v_entry->'examples') with ordinality
    loop
      insert into public.vocabulary_examples (
        item_id,
        position,
        english,
        japanese,
        generation_model,
        qa_model
      ) values (
        v_item_id,
        v_position::smallint,
        v_example->>'english',
        v_example->>'japanese',
        p_generation_model,
        p_qa_model
      )
      on conflict (item_id, position) do update
      set english = excluded.english,
          japanese = excluded.japanese,
          generation_model = excluded.generation_model,
          qa_model = excluded.qa_model;
      v_example_count := v_example_count + 1;
    end loop;
    v_item_count := v_item_count + 1;
  end loop;

  return jsonb_build_object(
    'items', v_item_count,
    'examples', v_example_count,
    'corrections', v_correction_count
  );
end;
$$;

revoke all on function public.import_vocabulary_example_batch(jsonb, text, text)
  from anon, authenticated, public;
grant execute on function public.import_vocabulary_example_batch(jsonb, text, text)
  to service_role;
