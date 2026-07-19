import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { NavigationIcon } from '@/components/ui/NavigationIcon';
import { useAssessment } from '@/features/assessment';
import { DryRunBanner } from '@/features/assessment/components/DryRunBanner';
import { useAuth, UserMenu } from '@/features/auth';
import { cn } from '@/lib/utils';

type LayoutProps = {
  children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const { configured, isLoading, session, signInWithGoogle } = useAuth();
  const { mode } = useAssessment();

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b-3 border-teal-950 bg-mint-50/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:h-[4.5rem] sm:px-6 lg:px-8">
          <Link to="/" className="brand-mark">
            <span aria-hidden="true">a</span>
            <strong>everyday</strong>
          </Link>
          {session && mode === 'dry-run' && <DryRunBanner compact />}
          <nav
            aria-label="メインナビゲーション"
            className="main-navigation flex items-center gap-3 text-sm font-bold sm:gap-6"
          >
            {session ? (
              <>
                <NavLink
                  to="/"
                  end
                  aria-label="ホーム"
                  data-tooltip="ホーム"
                  className={({ isActive }) =>
                    cn('nav-icon-link', isActive && 'nav-icon-active')
                  }
                >
                  <NavigationIcon name="home" />
                  <span className="sr-only">ホーム</span>
                </NavLink>
                <NavLink
                  to="/study"
                  aria-label="学習"
                  data-tooltip="学習"
                  className={({ isActive }) =>
                    cn('nav-icon-link', isActive && 'nav-icon-active')
                  }
                >
                  <NavigationIcon name="study" />
                  <span className="sr-only">学習</span>
                </NavLink>
                {mode === 'live' && (
                  <NavLink
                    to="/persona"
                    aria-label="プロフィール"
                    data-tooltip="プロフィール"
                    className={({ isActive }) =>
                      cn('nav-icon-link', isActive && 'nav-icon-active')
                    }
                  >
                    <NavigationIcon name="profile" />
                    <span className="sr-only">プロフィール</span>
                  </NavLink>
                )}
                <UserMenu />
              </>
            ) : (
              !isLoading &&
              configured && (
                <button
                  className="header-login-button"
                  onClick={() => void signInWithGoogle()}
                  type="button"
                >
                  Googleでログイン
                </button>
              )
            )}
          </nav>
        </div>
      </header>
      {session && mode === 'dry-run' && (
        <div className="dry-run-ribbon">
          DRY RUN ・ 固定された25問を使用 ・ 現在のCEFRには反映されません
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {children}
      </main>
    </div>
  );
}
