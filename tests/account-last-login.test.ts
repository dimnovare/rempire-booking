import { describe, expect, it } from "vitest";
import { lastShort } from "@/app/admin/(app)/account/last-login";
import { zonedToUtc } from "@/lib/tz";

/**
 * «Доступ» on a phone: a card's last login on one line (design «Доступ,
 * телефон: карточки», 26.11.2026): «Вход: сегодня, 09:12», «вчера, 19:30»,
 * else the date as the wide table has it. The days are the salon's.
 */
const TZ = "Europe/Tallinn";
const words = { today: "сегодня", yesterday: "вчера" };
const long = (ms: number) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);

describe("lastShort", () => {
  const now = at("2026-11-26", "10:30");

  it("today and yesterday by name, with the time", () => {
    expect(lastShort(at("2026-11-26", "09:12"), TZ, now, words, long)).toBe("сегодня, 09:12");
    expect(lastShort(at("2026-11-26", "00:05"), TZ, now, words, long)).toBe("сегодня, 00:05");
    expect(lastShort(at("2026-11-25", "19:30"), TZ, now, words, long)).toBe("вчера, 19:30");
    expect(lastShort(at("2026-11-25", "00:00"), TZ, now, words, long)).toBe("вчера, 00:00");
  });

  it("older: the wide table's date", () => {
    const t = at("2026-11-20", "17:45");
    expect(lastShort(t, TZ, now, words, long)).toBe(long(t));
    expect(long(t)).toMatch(/^20 нояб\.?, 17:45$/);
  });

  it("the salon's day, not UTC's: 01:30 in Tallinn is still the day before in UTC", () => {
    const early = at("2026-11-26", "01:30");
    expect(new Date(early).toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(lastShort(early, TZ, at("2026-11-26", "08:00"), words, long)).toBe("сегодня, 01:30");
  });

  it("yesterday across the spring clock change (a 23-hour day)", () => {
    // 29.03.2026 has 23 hours in Tallinn; just after midnight on the 30th, 24 hours back is the 28th
    const n = at("2026-03-30", "00:30");
    expect(lastShort(at("2026-03-29", "12:00"), TZ, n, words, long)).toBe("вчера, 12:00");
    expect(lastShort(at("2026-03-28", "23:50"), TZ, n, words, long)).toBe(long(at("2026-03-28", "23:50")));
  });
});
