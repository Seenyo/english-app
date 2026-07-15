import { Button } from '@/components/ui/Button';
import { useAuth } from './useAuth';

export function LoginButton() {
  const { signInWithGoogle, configured, error, clearError } = useAuth();

  if (!configured) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Supabase is not configured yet. See <code>SETUP.md</code> to add your
        keys.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={() => signInWithGoogle()}>
        Sign in with Google
      </Button>
      {error && (
        <p className="text-sm text-red-600">
          {error}{' '}
          <button type="button" className="underline" onClick={clearError}>
            dismiss
          </button>
        </p>
      )}
    </div>
  );
}
