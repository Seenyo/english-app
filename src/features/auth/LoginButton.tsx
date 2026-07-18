import { Button } from '@/components/ui/Button';
import { useAuth } from './useAuth';

export function LoginButton() {
  const { signInWithGoogle, configured, error, clearError } = useAuth();

  if (!configured) {
    return (
      <div className="rounded-2xl border-3 border-teal-950 bg-yellow-100 p-4 text-sm font-bold text-teal-900">
        Supabase is not configured yet. See <code>SETUP.md</code> to add your
        keys.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        className="h-14 px-7 text-base"
        variant="secondary"
        onClick={() => signInWithGoogle()}
      >
        Googleでログイン
      </Button>
      {error && (
        <p className="text-sm font-bold text-coral-700">
          {error}{' '}
          <button type="button" className="underline" onClick={clearError}>
            閉じる
          </button>
        </p>
      )}
    </div>
  );
}
