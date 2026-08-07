revoke all on table public.vocabulary_examples from service_role;
revoke all on table public.vocabulary_source_corrections from service_role;

grant select, insert, update on table public.vocabulary_examples
  to service_role;
grant select, insert, update on table public.vocabulary_source_corrections
  to service_role;
