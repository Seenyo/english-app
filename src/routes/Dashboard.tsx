import { useEffect, useState, type FormEvent } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'

type Note = { id: string; content: string; created_at: string }

export function Dashboard() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('notes')
      .select('id, content, created_at')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      setError(humanizeError(error))
      return
    }
    setNotes(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !draft.trim()) return
    // Omit user_id — the DB binds it via DEFAULT auth.uid(); WITH CHECK rejects
    // any attempt to forge another user's id.
    const { error } = await supabase.from('notes').insert({ content: draft.trim() })
    if (error) {
      setError(humanizeError(error))
      return
    }
    setDraft('')
    load()
  }

  async function removeNote(id: string) {
    if (!supabase) return
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) {
      setError(humanizeError(error))
      return
    }
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-600">
          Signed in as {user?.email}. Notes are private to you.
        </p>
      </div>

      <form onSubmit={addNote} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          Add
        </button>
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
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-sm">{n.content}</span>
              <button
                onClick={() => removeNote(n.id)}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function humanizeError(err: PostgrestError): string {
  if (
    err.code === '42P01' ||
    /relation ".*notes".*does not exist/i.test(err.message)
  ) {
    return 'The "notes" table does not exist yet. Run the SQL in SETUP.md.'
  }
  return err.message
}
