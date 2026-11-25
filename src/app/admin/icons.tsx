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
export const BellIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
export const WarnIcon = ({ size = 18 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M12 3.5 2.5 20h19z" />
    <path d="M12 10v4.5M12 17v.5" />
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
export const SearchIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.4-4.4" />
  </svg>
);
// the journal's bar (calendar.tsx, journal-bar.tsx): the status filter, the scale, the panel on the right
export const FunnelIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M4 5h16l-6 7v6l-4 2v-8z" />
  </svg>
);
export const ZoomIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5" />
  </svg>
);
export const PanelIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <rect x="4" y="4" width="16" height="16" />
    <path d="M14 4v16" />
  </svg>
);

// the client base (clients/): the bin that clears the conditions, the cog that picks the table's columns
export const BinIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M4 7h16M10 4h4M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </svg>
);
export const CogIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" />
  </svg>
);

// «Записи» (records/): the pencil that opens a visit, and the «i» of a cancelled one
export const PencilIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19zM13.5 7l3.5 3.5" />
  </svg>
);
export const InfoIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.5v.5" />
  </svg>
);
// «График работы» (schedule/): the printer, and the three dots of a barber's own menu
export const PrintIcon = ({ size = 16 }: P) => (
  <svg {...svg(size, 1.8)}>
    <path d="M7 9V4h10v5M7 17H4.5V9h15v8H17M7 14h10v6H7z" />
  </svg>
);
export const DotsIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);

/**
 * The small mark at the right of a visit's strip: a clock while it waits, a
 * plus once the client is in (a visit marked «done» before «Готово» left
 * the app too: Dim, decision round 11), a minus if he did not come. A visit
 * that waits and that the client has confirmed has a bare tick, no ring
 * («Клиент подтвердил»).
 */
export function StatusMark({ status, confirmed = false, size = 11 }: { status: string; confirmed?: boolean; size?: number }) {
  if (confirmed && status === "booked")
    return (
      <svg {...svg(size, 2.6)} className="mk mk-ok">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  return (
    <svg {...svg(size, 2.2)} className="mk">
      <circle cx="12" cy="12" r="9" />
      {status === "no_show" ? (
        <path d="M7.5 12h9" />
      ) : status === "arrived" || status === "done" ? (
        <path d="M12 7.5v9M7.5 12h9" />
      ) : (
        <path d="M12 7v5.5l3.5 2" />
      )}
    </svg>
  );
}

/** A barber's portrait (grey, like the client flow) or the first letter. */
export function Ava({ src, name, className }: { src: string | null | undefined; name: string; className?: string }) {
  return (
    <span className={`adm-ava${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" /> : (name || "?").charAt(0)}
    </span>
  );
}
