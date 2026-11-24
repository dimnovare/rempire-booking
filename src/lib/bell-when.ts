/**
 * When a row of the bell happened, as the bell says it
 * (src/app/admin/(app)/bell.tsx): «только что», «5 мин назад», «сегодня,
 * 14:05», «вчера, 18:20», then the day. On the salon's clock. Pure, for the
 * browser; the words are the admin's copy (A.bell).
 */
import { addDays, localParts } from "./tz";

export type BellWhen =
  | { kind: "now" }
  | { kind: "min"; n: number }
  | { kind: "today"; time: string }
  | { kind: "yesterday"; time: string }
  /** «24.11», or «24.11.2025» for another year */
  | { kind: "day"; date: string; time: string };

export function bellWhen(at: number, now: number, tz: string): BellWhen {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return { kind: "now" };
  if (min < 60) return { kind: "min", n: min };
  const a = localParts(at, tz);
  const today = localParts(now, tz).date;
  if (a.date === today) return { kind: "today", time: a.time };
  if (a.date === addDays(today, -1)) return { kind: "yesterday", time: a.time };
  const dm = `${a.date.slice(8, 10)}.${a.date.slice(5, 7)}`;
  return { kind: "day", date: a.date.slice(0, 4) === today.slice(0, 4) ? dm : `${dm}.${a.date.slice(0, 4)}`, time: a.time };
}
