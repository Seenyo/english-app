import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { UserMenu } from './UserMenu'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-semibold tracking-tight">
            English Study
          </Link>
          <nav className="flex items-center gap-3 text-sm sm:gap-5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-medium text-gray-900' : 'text-gray-600'
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? 'font-medium text-gray-900' : 'text-gray-600'
              }
            >
              Dashboard
            </NavLink>
            <UserMenu />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
