import type { ReactElement } from "react";

// One consistent set of line icons for the phone (24px grid, rounded strokes), so apps look designed, not emoji-dressed.
const PATHS: Record<string, ReactElement> = {
  chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.6a.5.5 0 0 1-.8-.4V16h-.5A2.5 2.5 0 0 1 4 13.5z" />,
  pay: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  shop: (
    <>
      <path d="M5 8h14l-1 11.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 19.2z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </>
  ),
  jobs: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
    </>
  ),
  news: (
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v13.5H7a2 2 0 0 1-2-2z" />
      <path d="M18 8h1.5A1.5 1.5 0 0 1 21 9.5v8a2 2 0 0 1-2 2M8.5 8h6M8.5 11.5h6M8.5 15h3.5" />
    </>
  ),
  maps: (
    <>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15.400 12 21 12 21z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  power: (
    <>
      <rect x="3" y="8" width="16" height="9" rx="2.5" />
      <path d="M21 11v3M11.500 9.500 9.500 12.500h3l-2 3" />
    </>
  ),
  back: <path d="M14.500 5 7.500 12l7 7" />,
  send: <path d="M20.500 3.500 10 14M20.500 3.500l-6.500 17-3.500-6.500L4 10.500z" />,
  call: <path d="M6.500 3.500h3l1.500 4-2 1.500a11 11 0 0 0 5.500 5.500l1.500-2 4 1.500v3a2 2 0 0 1-2 2A15.500 15.500 0 0 1 4.500 5.500a2 2 0 0 1 2-2z" />,
  save: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 7.500v9M9.500 10.500c0-1 1-1.600 2.500-1.600s2.500.7 2.500 1.700-1 1.400-2.500 1.700-2.500.7-2.500 1.700 1 1.700 2.500 1.700 2.500-.6 2.500-1.600" />
    </>
  ),
  loan: <path d="M3.500 9.500 12 4l8.500 5.500M5.500 10v7M9.500 10v7M14.500 10v7M18.500 10v7M3.500 19.500h17" />,
  topup: <path d="M4 15a12 12 0 0 1 16 0M7 18a8 8 0 0 1 10 0M12 21h.01" />,
  history: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 7.500V12l3 2" />
    </>
  ),
  home: <path d="M4 11.500 12 4.500l8 7M6 10v9.500h12V10M10 19.500v-5h4v5" />,
  truck: (
    <>
      <path d="M3 6.500h11v9.500H3zM14 9.500h3.500l3 3V16H14" />
      <circle cx="7" cy="17.500" r="1.800" />
      <circle cx="17" cy="17.500" r="1.800" />
    </>
  ),
  bell: <path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 1.500h-15zM10 20.500h4" />,
  lock: (
    <>
      <rect x="5.500" y="10.500" width="13" height="9.500" rx="2.500" />
      <path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500" />
    </>
  ),
  plug: <path d="M9 3.500v5M15 3.500v5M6.500 8.500h11v3a5.500 5.500 0 0 1-11 0zM12 17v3.500" />,
  bolt: <path d="M13 3 5.500 13.500H11L10 21l8-11h-5.500z" />,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  arrowIn: <path d="M17 7 7 17M7 8.500V17h8.500" />,
  arrowOut: <path d="M7 17 17 7M8.500 7H17v8.500" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3.500 2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.800l-5.200 2.800 1-5.800-4.300-4.100 5.900-.8z" />,
  people: (
    <>
      <circle cx="9" cy="8.500" r="3.200" />
      <path d="M3.500 19a5.500 5.500 0 0 1 11 0M16 5.500a3 3 0 0 1 0 6M17.500 14.500a5.500 5.500 0 0 1 3 4.500" />
    </>
  ),
  swap: <path d="M7 4 3.500 7.500 7 11M3.500 7.500h13M17 13l3.500 3.500L17 20M20.500 16.500h-13" />,
  signal: <path d="M5 19v-3M10 19v-6M15 19V9M20 19V5" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
