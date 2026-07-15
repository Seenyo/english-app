import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth';
import {
  createNote,
  deleteNote,
  humanizeNoteError,
  listNotes,
  type Note,
} from '@/features/notes';

export function Dashboard() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await listNotes());
    } catch (err) {
      setError(humanizeNoteError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await createNote(draft.trim());
      setDraft('');
      await refresh();
    } catch (err) {
      setError(humanizeNoteError(err));
    }
  }

  async function removeNote(id: string) {
    try {
      await deleteNote(id);
      await refresh();
    } catch (err) {
      setError(humanizeNoteError(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-600">
          Signed in as {user?.email}. Notes are private to you.
        </p>
      </div>

      <form className="flex gap-2" onSubmit={addNote}>
        <input
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note…"
          value={draft}
        />
        <Button type="submit">Add</Button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-500">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-sm">{note.content}</span>
              <button
                className="text-xs text-gray-500 hover:text-red-600"
                onClick={() => removeNote(note.id)}
                type="button"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
