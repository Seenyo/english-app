import { useAuth } from '../auth/useAuth'

export function LoginButton() {
  const { signInWithGoogle, configured, error, clearError } = useAuth()

  if (!configured) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Supabase is not configured yet. See <code>SETUP.md</code> to add your keys.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => signInWithGoogle()}
        className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
      >
        Sign in with Google
      </button>
      {error && (
        <p className="text-sm text-red-600">
          {error}{' '}
          <button className="underline" onClick={clearError}>
            dismiss
          </button>
        </p>
      )}
    </div>
  )
}
