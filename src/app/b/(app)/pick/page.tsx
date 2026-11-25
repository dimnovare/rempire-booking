/**
 * /b/pick: Renat or the front desk choose whose app to look at (a barber
 * never gets here). Since 20.11.2026 a barber's app is opened from
 * «Барберы» → the barber → «Открыть его приложение» (docs/apps.md, «One app
 * for Renat»), and nothing links here: this is only where /b falls back to
 * for an owner or the front desk with no barber of their own and nobody's
 * app open (requireStaff, src/lib/auth/current.ts).
 *
 * The design board «Чей день смотреть» (25.11): «‹ Салон» back to the
 * admin, a search by name, each barber with today's hours and visits, and
 * those who no longer work in the salon folded away.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loadCalendar } from "@/lib/admin/calendar";
import { requireStaffUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { staffToPick } from "@/lib/barber/account";
import { dbConfigured, query } from "@/lib/db";
import { localParts, todayIn } from "@/lib/tz";
import { getB } from "../../lang-server";
import { Ic } from "../sell/icons";
import { PickList, type PickRow } from "./pick-list";

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
  const [staff, day] = await Promise.all([staffToPick(query, business.id), loadCalendar(query, business, today, 1)]);
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
    const visits = day.visits.filter((v) => v.staffId === s.id && v.status !== "cancelled").length;
    const hours = spans.length ? B.pick.hours(spans.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(", ")) : B.pick.dayOff;
    return {
      id: s.id,
      name: s.name,
      photoUrl: s.photoUrl,
      active: s.active,
      mine: s.id === user.staffId,
      // those who left: no day to tell
      sub: s.active ? (visits ? `${hours} · ${B.day.visits(visits)}` : hours) : B.pick.off,
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
