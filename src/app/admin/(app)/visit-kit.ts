/**
 * What a visit's window (visit-parts.tsx, visit-window.tsx) and the phone's
 * visit sheet (visit-sheet.tsx, which the barber app opens too) share: the
 * status chips and a few formats. No words and no React here, so the
 * barber app takes it without the admin's dictionaries.
 */

export const fmt = (intl: string, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intl, { timeZone: tz, ...o });
export const timeOf = (tz: string, ms: number) => fmt("ru-RU", tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
/** The local day of a moment, YYYY-MM-DD. */
export const dayOf = (tz: string, ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «HH:MM» as minutes of the day; NaN for anything else. */
export const minutesOf = (hm: string) => (/^\d{2}:\d{2}$/.test(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : NaN);
export const MIN = 60_000;
/** The client has come: «arrived» (in the chair) or «done» (a visit marked so before «Готово» left the app: Dim, decision round 11). */
export const CAME = new Set(["arrived", "done"]);

/** The four chips: «Ожидание», «Пришёл», «Не пришёл», «Подтвердил». */
export const CHIPS = ["booked", "arrived", "no_show", "confirmed"] as const;
export type Chip = (typeof CHIPS)[number];
/** The status and flag a chip writes. «Подтвердил» is a waiting visit with its flag (021_visit_confirmed.sql). */
export const CHIP: Record<Chip, [string, boolean]> = { booked: ["booked", false], confirmed: ["booked", true], arrived: ["arrived", false], no_show: ["no_show", false] };
/** Which chip a visit's status and flag are. «done» is «Пришёл»: the client came. */
export const chipOf = (status: string, confirmed: boolean): Chip => (CAME.has(status) ? "arrived" : status === "no_show" ? "no_show" : confirmed ? "confirmed" : "booked");
