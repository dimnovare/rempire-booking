import { addDays, localParts, todayIn } from "@/lib/tz";

/**
 * A login's last login, short, for a phone's card (design «Доступ, телефон:
 * карточки», 26.11.2026): «сегодня, 09:12», «вчера, 19:30», else as the
 * wide table has it (`long`), «20 нояб., 17:45». The days are the salon's
 * (`tz`), not the server's.
 */
export function lastShort(ms: number, tz: string, now: number, words: { today: string; yesterday: string }, long: (ms: number) => string): string {
  const { date, time } = localParts(ms, tz);
  const today = todayIn(tz, now);
  if (date === today) return `${words.today}, ${time}`;
  if (date === addDays(today, -1)) return `${words.yesterday}, ${time}`;
  return long(ms);
}
