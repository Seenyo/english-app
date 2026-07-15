import { useAuth } from '../auth/useAuth'

export function UserMenu() {
  const { session, user, signOut, configured } = useAuth()

  if (!configured || !session) return null

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-gray-600 sm:inline">
        {user?.email}
      </span>
      <button
        onClick={() => signOut()}
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        Sign out
      </button>
    </div>
  )
}
