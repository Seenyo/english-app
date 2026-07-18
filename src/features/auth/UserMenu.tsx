import { useAuth } from './useAuth';

export function UserMenu() {
  const { session, user, signOut, configured } = useAuth();

  if (!configured || !session) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-teal-700 md:inline">
        {user?.email}
      </span>
      <button
        type="button"
        className="rounded-xl px-2 py-1 text-sm font-bold text-teal-700 hover:bg-sky-100 hover:text-teal-950"
        onClick={() => signOut()}
      >
        ログアウト
      </button>
    </div>
  );
}
