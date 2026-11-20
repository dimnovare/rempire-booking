/**
 * Brand marks. The tower path is copied byte for byte from
 * public/brand/rempire-tower.svg (the shop's file): never redraw it.
 */
export const TOWER_PATH =
  "M541.42,377.53l-18.69,10.82s11.14,130.41,11.54,135.02c-.23,7.19-11.13,15.39-28.52,21.44-20.85,7.24-49.58,11.23-80.91,11.23s-59.98-3.98-80.82-11.21c-17.37-6.02-28.29-14.2-28.6-21.39.67-7.94,14-157.47,15.72-177.3,6.37-6.37,30.14-20.91,95.48-18.91,72.13,2.21,93.63,19.61,93.88,19.75l16.98-11.55-12.38-117.42c-.91-14.04-12.92-23.77-33.91-33.43h0c-1.28-.59-2.76-.48-3.94.28l-8.63,5.58c-1.17.76-1.88,2.05-1.88,3.45v22.14c-6.08-1.56-13.19-3.4-19.85-4.35l-.52-32.33c-.05-3.02-2.31-5.55-5.31-5.93l-3.33-.42c-15.83-1.78-31.85-1.73-47.62.16l-3.82.46c-3.02.36-5.31,2.9-5.35,5.94l-.52,32.29c-6.72.99-12.86,3.08-18.9,4.68v-22.4c0-1.25-.57-2.44-1.55-3.22l-7.71-6.16c-1.22-.97-2.88-1.18-4.29-.53h0c-1.16.53-2.3,1.07-3.4,1.62-19.74,9.8-30.84,19.65-31.12,33.52l-7.12,64.63,5.48,16.43s32.05-29.18,102.06-26.35c39.67.51,59.56,11.01,59.56,11.01l11.75-15.24s-31.68-13.66-73.8-13.66c-59.49,0-86.24,15.83-86.24,15.83,0,0,5.09-51.57,5.11-51.87,0,0-.58,6.05.01-.28.87-9.26,15.42-13.93,15.42-13.93l-1.08,34.17s28.19-12.25,53.12-12.25l.6-37.37c0-2.19,30.62-2.27,30.63-.09l.6,37.39c24.34,0,53.11,11.72,53.11,11.72v-31.59s15.68,5.68,16.2,14.85l9.32,102.14c-9.24-2.87-25.63-14.19-93.35-16.33-69.08-2.19-111.82,15.96-113.22,30.02l-.45,4.28c-18.92,186.41-18.92,181.8-18.92,182.08,0,16.85,15.11,31.77,42.54,42.03,24.21,9.05,56.19,14.04,90.05,14.04s65.84-4.99,90.05-14.04c27.43-10.26,42.54-25.18,42.54-42.03,0-.3-16.02-147.42-16.02-147.42Z";

export function TowerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="292.24 171.22 265.18 409.8" fill="currentColor" aria-hidden="true" className={className}>
      <path d={TOWER_PATH} />
    </svg>
  );
}

export function Logo() {
  // rempire.ee thin REMPIRE, redrawn as strokes (docs/brand.md)
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo" src="/brand/rempire-logo-white.svg" alt="REMPIRE" width={118} height={30} />;
}

/** The client pages' mark, as in the booking widget Renat knows: the thin REMPIRE on a dark disc. */
export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <span className="mark-logo" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/rempire-logo-white.svg" alt="REMPIRE" width={118} height={30} />
    </span>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const ChevronIcon = ({ dir = "down", size = 24, width = 2 }: { dir?: "down" | "up" | "left" | "right"; size?: number; width?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} strokeWidth={width} aria-hidden="true">
    <path d={dir === "down" ? "M6 9l6 6 6-6" : dir === "up" ? "M6 15l6-6 6 6" : dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);
export const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.8" aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M17 13.4c2.4.4 4 2.6 4 5.6" />
  </svg>
);
export const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13 7l4 4" />
  </svg>
);
export const DayIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.8" aria-hidden="true">
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M8 3v4M16 3v4M8 12h8" />
  </svg>
);
export const InfoIcon = () => (
  <svg viewBox="0 0 10 12" width="10" height="12" {...stroke} strokeWidth="1.8" aria-hidden="true">
    <path d="M5 5.4v5M5 1.6v.2" />
  </svg>
);
export const StarIcon = ({ on = true, size = 16 }: { on?: boolean; size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill={on ? "var(--star)" : "var(--edge)"} aria-hidden="true">
    <path d="M8 1.6l1.98 4.01 4.42.64-3.2 3.12.76 4.41L8 11.7l-3.96 2.08.76-4.41-3.2-3.12 4.42-.64z" />
  </svg>
);
/* the salon's page: where, when, how to reach it (thin lines, as the widget's) */
export const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
export const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <path d="M8.2 3.8l1.9 4.1-2.2 1.6a11.6 11.6 0 0 0 6.6 6.6l1.6-2.2 4.1 1.9-.6 3a2 2 0 0 1-2.1 1.6C10.4 19.8 4.2 13.6 3.6 6.5a2 2 0 0 1 1.6-2.1z" />
  </svg>
);
export const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
  </svg>
);
/** a messenger: WhatsApp, Telegram, Viber (never their marks) */
export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.3A7.5 7.5 0 1 1 20 11.5z" />
  </svg>
);
/** a social profile: Instagram, Facebook (never their marks) */
export const AtIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="3.6" />
    <path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 7" />
  </svg>
);

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const CheckIcon = ({ size = 16, width = 2.4 }: { size?: number; width?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={width} aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const CrossIcon = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
export const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
