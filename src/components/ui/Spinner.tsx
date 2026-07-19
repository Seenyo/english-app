import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-coral-500 motion-reduce:animate-none',
        className,
      )}
    />
  );
}
