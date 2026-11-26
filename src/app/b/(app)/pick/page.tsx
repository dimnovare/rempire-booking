/**
 * /b/pick: Renat or the front desk choose whose app to look at (a barber
 * never gets here). Since 20.11.2026 a barber's app is opened from
 * «Барберы» → the barber → «Открыть его приложение» (docs/apps.md, «One app
 * for Renat»), and nothing links here: this is only where /b falls back to
 * for an owner or the front desk with no barber of their own and nobody's
 * app open (requireStaff, src/lib/auth/current.ts).
 *
 * The design board «Чей день смотреть» (25.11, grouped by today 26.11):
 * «‹ Салон» back to the admin, a search by name, «Сегодня работают» with
 * today's hours and visits, «Сегодня выходной» with the next working day,
 * and those who left the salon folded away.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loadCalendar } from "@/lib/admin/calendar";
import { requireStaffUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { staffToPick } from "@/lib/barber/account";
import { dbConfigured, query } from "@/lib/db";
import { localParts, todayIn } from "@/lib/tz";
import { barberLang, getB } from "../../lang-server";
import { Ic } from "../sell/icons";
import { PickList, type PickRow } from "./pick-list";

const TAG = { ru: "ru-RU", et: "et-EE", en: "en-GB" } as const;

export default function PickPage() {
  return (
    <Suspense fallback={null}>
      <Pick />
    </Suspense>
  );
}

async function Pick() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user, business } = await requireStaffUser();
  if (user.role === "staff") redirect("/b");
  const tz = business.timezone;
  const today = todayIn(tz);
  // two weeks: for a barber off today, his next working day
  const [staff, day, lang] = await Promise.all([staffToPick(query, business.id), loadCalendar(query, business, today, 14), barberLang()]);
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(TAG[lang], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  // his own day first, if this login is a barber too
  const all = staff.filter((s) => can(user, "journal.staff", { staffId: s.id }));
  const list = [...all.filter((s) => s.id === user.staffId), ...all.filter((s) => s.id !== user.staffId)];
  const hm = (t: number) => {
    const p = localParts(t, tz);
    // a window to midnight ends at «24:00», as the rest of the app says it
    return p.date !== today && p.time === "00:00" ? "24:00" : p.time;
  };
  const rows: PickRow[] = list.map((s) => {
    const spans = day.work[s.id]?.[today] ?? [];
    const visits = day.visits.filter((v) => v.staffId === s.id && v.status !== "cancelled" && localParts(v.start, tz).date === today).length;
    const hours = spans.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(", ");
    const next = Object.keys(day.work[s.id] ?? {})
      .filter((d) => d > today && (day.work[s.id]?.[d]?.length ?? 0) > 0)
      .sort()[0];
    return {
      id: s.id,
      name: s.name,
      photoUrl: s.photoUrl,
      active: s.active,
      today: s.active && spans.length > 0,
      mine: s.id === user.staffId,
      // working today: hours and visits; off today: the next working day; those who left: no day to tell
      sub: !s.active ? B.pick.off : spans.length ? (visits ? `${hours} · ${B.day.visits(visits)}` : hours) : next ? B.pick.next(dayName(next)) : B.pick.noNext,
    };
  });
  return (
    <main className="adm-page bx-pick">
      <title>{`${B.pick.title} · REMPIRE`}</title>
      <a className="bx-lnk bx-back" href="/admin">
        <Ic name="left" size={18} />
        {B.pick.toSalon}
      </a>
      <div>
        <h1 className="adm-h1">{B.pick.title}</h1>
        <p className="adm-meta">{B.pick.lead}</p>
      </div>
      {rows.length === 0 ? <p className="adm-meta">{B.pick.none}</p> : <PickList rows={rows} />}
    </main>
  );
}
