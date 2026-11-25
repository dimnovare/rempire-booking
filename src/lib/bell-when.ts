/**
 * When a row of the bell happened, as the bell says it
 * (src/app/admin/(app)/bell.tsx), the way the product we follow does: the
 * time for today («15:52»), the day and month before that («24 ноя»), and
 * the year too for another year. On the salon's clock. Pure, for the
 * browser; the words are the admin's copy (A.bell).
 */
import { localParts } from "./tz";

export type BellWhen =
  | { kind: "today"; time: string }
  /** month 0–11; year only when it is not this year */
  | { kind: "day"; day: number; month: number; year?: number };

export function bellWhen(at: number, now: number, tz: string): BellWhen {
  const a = localParts(at, tz);
  const today = localParts(now, tz).date;
  if (a.date === today) return { kind: "today", time: a.time };
  const year = Number(a.date.slice(0, 4));
  const day = { kind: "day" as const, day: Number(a.date.slice(8, 10)), month: Number(a.date.slice(5, 7)) - 1 };
  return year === Number(today.slice(0, 4)) ? day : { ...day, year };
}
