import type { SVGProps } from 'react';

export default function MotoMiniaturaIcone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 82"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="25" cy="63" r="16" />
      <circle cx="100" cy="63" r="16" />
      <path d="m25 63 23-6M49 63l7 3h12c5 0 6-4 9-10l9-17 14 24M5 45l8-13h18l23 6 13-13 14 4 7-8c7 2 12 7 14 15l7 2M13 32c11 4 23 12 40 24 3 2 4-2 8-6 5-5 10-4 15 1M91 29l9 34M88 21l-9-12 8 6M78 19h9M93 37l15 1" />
      <circle cx="25" cy="63" r="2" strokeWidth="2" />
    </svg>
  );
}
