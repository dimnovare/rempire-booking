/** The admin's small line icons: one stroke style, square ends, currentColor. */
type P = { size?: number };
const svg = (size: number, width: number) => ({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: width, "aria-hidden": true }) as const;

export const OutIcon = ({ size = 20 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M10 4H5v16h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </svg>
);
export const PrevIcon = ({ size = 18 }: P) => (
  <svg {...svg(size, 2)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const NextIcon = ({ size = 18 }: P) => (
  <svg {...svg(size, 2)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const CaretIcon = ({ size = 14 }: P) => (
  <svg {...svg(size, 2.2)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const PlusIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 2.4)}>
    <path d="M12 4v16M4 12h16" />
  </svg>
);
export const XIcon = ({ size = 20 }: P) => (
  <svg {...svg(size, 2.2)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const TickIcon = ({ size = 14 }: P) => (
  <svg {...svg(size, 3)}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
export const EyeIcon = ({ size = 20 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** A barber's portrait (grey, like the client flow) or the first letter. */
export function Ava({ src, name, className }: { src: string | null | undefined; name: string; className?: string }) {
  return (
    <span className={`adm-ava${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" /> : (name || "?").charAt(0)}
    </span>
  );
}
