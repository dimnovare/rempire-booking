/**
 * A one-visit calendar file (RFC 5545). Times in UTC, so every calendar
 * app shows the right local time.
 */
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
