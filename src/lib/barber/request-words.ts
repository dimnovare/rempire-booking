/**
 * A barber's change to his time or prices (B4), in words: one line in the
 * reader's language, for Renat's «Запросы», the barber's own list and the
 * push about it. Pure: the push builds it when it goes, in that login's
 * language, and the pages in theirs.
 */
import type { Locale } from "../i18n";
import { isoWeekday, localParts } from "../tz";

type Text3 = { ru?: string; et?: string; en?: string };
export type OffKind = "block" | "vacation" | "sick";
/** weekday (1 = Monday … 7) → spans «HH:MM» */
export type WeekHours = Record<string, [string, string][]>;

/** A vacation or sick days, at most this many days at once. */
export const MAX_OFF_DAYS = 92;
/** Special time repeats on the same weekday at most this many weeks. */
export const MAX_WEEKS = 12;
/** Spans a day in his weekly hours (a break is the gap between two). */
export const MAX_SPANS = 3;

/** What a barber asked for or did; moments are epoch milliseconds. */
export type RequestWhat =
  | { kind: "time_off"; action: "add" | "remove"; offKind: OffKind; from: number; to: number }
  | { kind: "special"; action: "add" | "remove"; from: number; to: number; extraCents: number; weeks?: number }
  | { kind: "hours"; days: WeekHours }
  | { kind: "price"; serviceId: string; service: Text3; fromCents: number; toCents: number; fromMin: number; toMin: number };

const W = {
  ru: {
    days: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
    off: { block: "Перерыв", vacation: "Отпуск", sick: "Больничный" },
    removed: "Убрано",
    special: "Особое время",
    weeks: (n: number) => `${n} нед. подряд`,
    hours: "Часы работы",
    dayOff: "выходной",
    min: "мин",
  },
  et: {
    days: ["E", "T", "K", "N", "R", "L", "P"],
    off: { block: "Paus", vacation: "Puhkus", sick: "Haigus" },
    removed: "Eemaldatud",
    special: "Eriaeg",
    weeks: (n: number) => `${n} nädalat järjest`,
    hours: "Tööaeg",
    dayOff: "vaba",
    min: "min",
  },
  en: {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    off: { block: "Break", vacation: "Vacation", sick: "Sick days" },
    removed: "Removed",
    special: "Special time",
    weeks: (n: number) => `${n} weeks in a row`,
    hours: "Working hours",
    dayOff: "off",
    min: "min",
  },
} satisfies Record<Locale, unknown>;

const DAY = 86_400_000;
const pick = (t: Text3 | undefined, l: Locale) => t?.[l] || t?.ru || t?.et || t?.en || "";
const euro = (cents: number) => {
  const e = cents / 100;
  return `${Number.isInteger(e) ? e : e.toFixed(2)} €`;
};
const dm = (date: string) => `${Number(date.slice(8, 10))}.${date.slice(5, 7)}`;

/** «ср 18.11» on the salon's clock. */
function dayWords(ms: number, tz: string, l: Locale): string {
  const p = localParts(ms, tz);
  return `${W[l].days[isoWeekday(p.date) - 1]} ${dm(p.date)}`;
}

/** «ср 18.11, 13:00–14:00», or across midnight «ср 18.11, 22:00 – чт 19.11, 02:00». */
function span(from: number, to: number, tz: string, l: Locale): string {
  const a = localParts(from, tz);
  const b = localParts(to, tz);
  if (a.date === b.date || (b.time === "00:00" && to - from <= DAY)) return `${dayWords(from, tz, l)}, ${a.time}–${b.time === "00:00" ? "24:00" : b.time}`;
  return `${dayWords(from, tz, l)}, ${a.time} – ${dayWords(to, tz, l)}, ${b.time}`;
}

/** Whole days, the last one inclusive: «1.12–14.12», or one day «ср 1.12». */
function days(from: number, to: number, tz: string, l: Locale): string {
  const first = localParts(from, tz).date;
  const last = localParts(to - 1, tz).date;
  return first === last ? dayWords(from, tz, l) : `${dm(first)}–${dm(last)}`;
}

/** The week in groups of days with the same hours: [«пн–пт», «10:00–20:00»], [«вс», «выходной»]. */
export function weekGroups(week: WeekHours, l: Locale): { days: string; hours: string }[] {
  const w = W[l];
  const line = (wd: number) => (week[String(wd)] ?? []).map(([a, b]) => `${a}–${b}`).join(", ") || w.dayOff;
  const out: { days: string; hours: string }[] = [];
  for (let wd = 1; wd <= 7; ) {
    let end = wd;
    while (end < 7 && line(end + 1) === line(wd)) end++;
    out.push({ days: end === wd ? w.days[wd - 1] : `${w.days[wd - 1]}–${w.days[end - 1]}`, hours: line(wd) });
    wd = end + 1;
  }
  return out;
}

/** «пн–пт 10:00–20:00, сб 11:00–18:00, вс выходной»: the same days run together. */
export function weekWords(week: WeekHours, l: Locale): string {
  return weekGroups(week, l).map((g) => `${g.days} ${g.hours}`).join(", ");
}

/** One line for a request, in this language, on the salon's clock. */
export function requestWords(what: RequestWhat, tz: string, l: Locale): string {
  const w = W[l];
  switch (what.kind) {
    case "time_off": {
      const when = what.offKind === "block" ? span(what.from, what.to, tz, l) : days(what.from, what.to, tz, l);
      const line = `${w.off[what.offKind] ?? what.offKind} · ${when}`;
      return what.action === "remove" ? `${w.removed}: ${line}` : line;
    }
    case "special": {
      const weeks = what.weeks && what.weeks > 1 ? ` · ${w.weeks(what.weeks)}` : "";
      const line = `${w.special} +${euro(what.extraCents)} · ${span(what.from, what.to, tz, l)}${weeks}`;
      return what.action === "remove" ? `${w.removed}: ${line}` : line;
    }
    case "hours":
      return `${w.hours}: ${weekWords(what.days, l)}`;
    case "price": {
      const parts = [what.fromCents !== what.toCents ? `${euro(what.fromCents)} → ${euro(what.toCents)}` : euro(what.toCents)];
      if (what.fromMin !== what.toMin) parts.push(`${what.fromMin} → ${what.toMin} ${w.min}`);
      return `${pick(what.service, l)}: ${parts.join(", ")}`;
    }
  }
}

/** Is this a RequestWhat (read back from jsonb)? */
export function isRequestWhat(x: unknown): x is RequestWhat {
  const k = (x as { kind?: unknown })?.kind;
  return k === "time_off" || k === "special" || k === "hours" || k === "price";
}
