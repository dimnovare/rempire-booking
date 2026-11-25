/**
 * The line icons of the barber pages redrawn on 25.11 (the design boards
 * «Продать», «Мои расчёты», «Моё время», «Установить», «Чей день
 * смотреть»): one 24px grid, a 1.8 stroke with round ends, currentColor.
 * Here, beside «Продать», because the admin's own set (admin/icons.tsx) has
 * square ends and other shapes.
 */
const PATHS = {
  scan: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6",
  cam: "M4 8h3l2-3h6l2 3h3v11H4z",
  search: "M20 20l-3.5-3.5",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  down: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 7v5l3 2",
  time: "M12 7.5V12l3 2",
  cal: "M3.5 10h17M8 3v4M16 3v4",
  copy: "M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  share: "M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  addSquare: "M12 8.5v7M8.5 12h7",
  bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
} as const;

export type IconName = keyof typeof PATHS | "star" | "dots";

export function Ic({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  if (name === "star")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffcb00" aria-hidden="true" className={className}>
        <path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.1l-5.9 3.4 1.4-6.6-5-4.5 6.6-.7z" />
      </svg>
    );
  if (name === "dots")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <circle cx="12" cy="5" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="12" cy="19" r="1.7" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {name === "cam" && <circle cx="12" cy="13" r="3.5" />}
      {name === "search" && <circle cx="11" cy="11" r="7" />}
      {(name === "clock" || name === "time") && <circle cx="12" cy="12" r={name === "clock" ? 9 : 8.5} />}
      {name === "cal" && <rect x="3.5" y="5" width="17" height="15.5" />}
      {name === "copy" && <rect x="8" y="8" width="12" height="12" rx="2" />}
      {name === "addSquare" && <rect x="4" y="4" width="16" height="16" rx="4" />}
      <path d={PATHS[name]} />
    </svg>
  );
}
