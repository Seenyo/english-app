import { useAuth } from './useAuth';
import { NavigationIcon } from '@/components/ui/NavigationIcon';

export function UserMenu() {
  const { session, user, signOut, configured } = useAuth();

  if (!configured || !session) return null;

  return (
    <div className="header-user-menu">
      <span className="hidden max-w-[12rem] truncate text-sm text-teal-700 md:inline">
        {user?.email}
      </span>
      <button
        aria-label="ログアウト"
        type="button"
        className="nav-icon-button nav-icon-logout"
        data-tooltip="ログアウト"
        onClick={() => signOut()}
      >
        <NavigationIcon name="logout" />
        <span className="sr-only">ログアウト</span>
      </button>
    </div>
  );
}
