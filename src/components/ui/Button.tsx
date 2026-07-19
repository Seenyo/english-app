import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary:
    'border-3 border-teal-950 bg-coral-500 text-white shadow-[0_4px_0_#173a3f] hover:-translate-y-0.5 hover:bg-coral-600 hover:shadow-[0_6px_0_#173a3f] active:translate-y-1 active:shadow-none',
  secondary:
    'border-3 border-teal-950 bg-white text-teal-950 shadow-[0_4px_0_#173a3f] hover:-translate-y-0.5 hover:bg-sky-100 active:translate-y-1 active:shadow-none',
  ghost: 'text-teal-700 hover:bg-sky-100 hover:text-teal-950',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition-all focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-coral-500 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
