create or replace function public.get_vocabulary_section_mastery(
  p_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', section_counts.kind,
        'section', section_counts.section,
        'total', section_counts.total,
        'mastered', section_counts.mastered,
        'isMastered',
          section_counts.total > 0
          and section_counts.mastered = section_counts.total
      )
      order by
        case section_counts.kind when 'word' then 0 else 1 end,
        section_counts.section
    ),
    '[]'::jsonb
  )
  from (
    select
      item.kind,
      item.section,
      count(*)::integer as total,
      count(*) filter (
        where classification.rating = 'mastered'
      )::integer as mastered
    from public.vocabulary_items item
    left join public.vocabulary_classifications classification
      on classification.item_id = item.id
     and classification.user_id = p_user_id
    where item.owner_user_id is null
      and item.section is not null
    group by item.kind, item.section
  ) section_counts;
$$;

revoke all on function public.get_vocabulary_section_mastery(uuid)
from anon, authenticated, public;

grant execute on function public.get_vocabulary_section_mastery(uuid)
to service_role;
