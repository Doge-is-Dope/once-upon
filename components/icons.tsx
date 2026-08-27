import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

export function CopyIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
    <rect x="8" y="8" width="13" height="13" rx="2.25" />
    <path d="M16 8V5.75A2.75 2.75 0 0 0 13.25 3h-7.5A2.75 2.75 0 0 0 3 5.75v7.5A2.75 2.75 0 0 0 5.75 16H8" />
  </svg>;
}

export function CheckIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
    <path d="m5 12.5 4 4L19 7" />
  </svg>;
}
