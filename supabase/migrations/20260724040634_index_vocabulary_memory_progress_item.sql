-- Cover the item foreign key for cascades independently of the
-- (user_id, item_id) primary-key order.
create index vocabulary_memory_progress_item_idx
  on vocabulary_memory_progress(item_id);
