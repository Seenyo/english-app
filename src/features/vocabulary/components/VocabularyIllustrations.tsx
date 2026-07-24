import type { SVGProps } from 'react';

type IllustrationProps = SVGProps<SVGSVGElement>;

export function StudyHeroIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 180 150" {...props}>
      <path
        d="M35 27h89a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10H35a10 10 0 0 1-10-10V37a10 10 0 0 1 10-10Z"
        fill="#fff"
      />
      <path
        d="M35 27h89a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10H35a10 10 0 0 1-10-10V37a10 10 0 0 1 10-10Z"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="m55 105-3 15c-1 6 3 11 9 12l79 8c6 1 11-3 12-9l5-51c1-6-3-11-9-12l-14-1"
        fill="#bcebcf"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M47 52h64M47 68h45M47 84h55"
        stroke="#ed554b"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="m142 27 3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9Z"
        fill="#ffdf72"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}

export function VocabularyDeckIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 220 170" {...props}>
      <path
        d="m57 31 116 18a12 12 0 0 1 10 14l-12 78a12 12 0 0 1-14 10L41 133a12 12 0 0 1-10-14l12-78a12 12 0 0 1 14-10Z"
        fill="#ffc9c3"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="M48 18h116a12 12 0 0 1 12 12v78a12 12 0 0 1-12 12H48a12 12 0 0 1-12-12V30a12 12 0 0 1 12-12Z"
        fill="#fff5c7"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="M63 48h80M63 69h56M63 90h68"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <circle
        cx="158"
        cy="106"
        r="21"
        fill="#bcebcf"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="m149 106 6 6 12-14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}

export function VocabularyHeaderIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 120 120" {...props}>
      <path
        d="M18 27c15-5 29-1 42 10v61c-13-11-27-15-42-10V27Z"
        fill="#fff5c7"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M102 27c-15-5-29-1-42 10v61c13-11 27-15 42-10V27Z"
        fill="#e4f7fa"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M31 48h17M31 62h17M72 48h17M72 62h17"
        stroke="#173a3f"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="m60 14 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z"
        fill="#ffdf72"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}
