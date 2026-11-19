/**
 * «День | Неделя» in the head of «Мой день» (docs/apps.md, «One app for
 * Renat»; the design board «A»): the own day of an owner or the front desk
 * who cuts too has its day and its week behind one tab of the bar, so the
 * two are switched here. Two links: the day and the week are the barber
 * app's own pages. No hooks: the day's screen and the week's page both
 * draw it.
 */
import Link from "next/link";

export function OwnSeg({ view, date, today, words }: { view: "day" | "week"; date: string; today: string; words: { view: string; day: string; week: string } }) {
  return (
    <nav className="bx-own-seg" aria-label={words.view}>
      <Link href={date === today ? "/b" : `/b?d=${date}`} aria-current={view === "day" ? "page" : undefined} prefetch={false} replace>
        {words.day}
      </Link>
      <Link href={date === today ? "/b/week" : `/b/week?d=${date}`} aria-current={view === "week" ? "page" : undefined} prefetch={false} replace>
        {words.week}
      </Link>
    </nav>
  );
}
