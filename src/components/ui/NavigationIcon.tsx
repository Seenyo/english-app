import type { SVGProps } from 'react';

export type NavigationIconName =
  'home' | 'study' | 'profile' | 'feedback' | 'logout';

type NavigationIconProps = SVGProps<SVGSVGElement> & {
  name: NavigationIconName;
};

export function NavigationIcon({ name, ...props }: NavigationIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    >
      {name === 'home' && (
        <>
          <path d="M3.5 10.8 12 3.7l8.5 7.1" />
          <path d="M5.8 9.2v10.1h12.4V9.2M9.5 19.3v-5.8h5v5.8" />
        </>
      )}
      {name === 'study' && (
        <>
          <path d="M3.5 5.2c3.5-.7 6.3.1 8.5 2.2v12c-2.2-2.1-5-2.9-8.5-2.2v-12Z" />
          <path d="M20.5 5.2c-3.5-.7-6.3.1-8.5 2.2v12c2.2-2.1 5-2.9 8.5-2.2v-12Z" />
        </>
      )}
      {name === 'profile' && (
        <>
          <circle cx="12" cy="8.2" r="3.4" />
          <path d="M5.1 20c.8-4 3.1-6 6.9-6s6.1 2 6.9 6" />
        </>
      )}
      {name === 'feedback' && (
        <>
          <path d="M5 4.5h14v12H9.5L5 20v-15.5Z" />
          <path d="M8.5 8.5h7M8.5 12.2h4.8" />
        </>
      )}
      {name === 'logout' && (
        <>
          <path d="M10 4H5.2v16H10" />
          <path d="M13.5 8.2 17.3 12l-3.8 3.8M8.5 12h8.8" />
        </>
      )}
    </svg>
  );
}
