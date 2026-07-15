import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { LoginButton } from '../components/LoginButton'

export function Home() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Study English
        </h1>
        <p className="mt-2 text-gray-600">
          A minimal scaffold: Google login, per-user storage, deployed to GitHub
          Pages.
        </p>
      </div>
      {user ? (
        <Link
          to="/dashboard"
          className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Go to Dashboard
        </Link>
      ) : (
        <LoginButton />
      )}
    </div>
  )
}
