import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, session } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
