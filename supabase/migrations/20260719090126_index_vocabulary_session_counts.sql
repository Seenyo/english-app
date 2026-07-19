-- Session summaries count non-reverted classifications by rating. Keep that
-- hot path independent of the retained, append-only operation history size.
create index if not exists vocabulary_operations_session_active_counts_idx
  on public.vocabulary_classification_operations(session_id, rating)
  where action = 'classify' and reverted_at is null;
