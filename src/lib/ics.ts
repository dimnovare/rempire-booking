/**
 * A one-visit calendar file (RFC 5545). Times in UTC, so every calendar
 * app shows the right local time.
 */
import { COPY, pick, type Locale } from "./i18n";
import type { VisitView } from "./visits";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 octets fold onto the next line with a leading space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function visitIcs(v: {
  uid: string;
  start: number;
  end: number;
  summary: string;
  location: string;
  description: string;
  url?: string;
  cancelled?: boolean;
  now?: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//REMPIRE//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${v.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${v.uid}`,
    // minutes since 2026: a file built later (a moved or cancelled visit)
    // always outranks an earlier one, wherever it came from
    `SEQUENCE:${Math.max(0, Math.floor(((v.now ?? Date.now()) - Date.UTC(2026, 0, 1)) / 60_000))}`,
    `DTSTAMP:${stamp(v.now ?? Date.now())}`,
    `DTSTART:${stamp(v.start)}`,
    `DTEND:${stamp(v.end)}`,
    `SUMMARY:${esc(v.summary)}`,
    `LOCATION:${esc(v.location)}`,
    `DESCRIPTION:${esc(v.description)}`,
    ...(v.url ? [`URL:${v.url}`] : []),
    `STATUS:${v.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(v.summary)}`,
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * The calendar file for one visit, the same from /api/ics/<token> and as
 * the confirmation letter's attachment. `origin` is the app's address;
 * the change link inside uses the token the reader already has.
 */
export function visitIcsFor(
  v: Pick<VisitView, "id" | "status" | "startsAt" | "endsAt" | "staffName" | "services" | "location">,
  o: { businessName: string; origin: string; token: string; locale: Locale; now?: number },
): string {
  const c = COPY[o.locale];
  const services = v.services.map((s) => pick(s.name, o.locale)).join(" + ");
  const manage = `${o.origin}/${o.locale}/visit/${o.token}`;
  return visitIcs({
    uid: `${v.id}@rempire-booking`,
    start: Date.parse(v.startsAt),
    end: Date.parse(v.endsAt),
    summary: `${o.businessName}: ${services}`,
    location: [v.location.name, v.location.address].filter(Boolean).join(", "),
    description: `${c.barberK}: ${v.staffName}\n${c.changeCancel}: ${manage}`,
    url: manage,
    cancelled: v.status === "cancelled",
    now: o.now,
  });
}
