import { supabase } from '@/lib/supabase';
import type { Note } from './types';

export async function listNotes(): Promise<Note[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createNote(content: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  // Omit user_id — the DB binds it via DEFAULT auth.uid(); WITH CHECK rejects
  // any attempt to forge another user's id.
  const { error } = await supabase.from('notes').insert({ content });
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

export function humanizeNoteError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    const message = (err as { message?: string }).message ?? '';
    if (
      code === '42P01' ||
      /relation ".*notes".*does not exist/i.test(message)
    ) {
      return 'The "notes" table does not exist yet. Run the SQL in SETUP.md.';
    }
    return message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
