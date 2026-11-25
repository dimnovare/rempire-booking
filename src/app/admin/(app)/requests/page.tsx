/**
 * /admin/requests «Запросы» (Phase B, B4; redesigned 25.11.2026 after the
 * design artifact 53PfD3DxCRkbDyjwLVvBHB): what the barbers ask for from
 * their app. Two tabs: «Ждут ответа», each request a card with «Было /
 * Станет», the visits a day off would leave and «Согласовать» /
 * «Отклонить»; and «История» (?tab=history), the last 30 days. What
 * barbers change themselves, and what waits for an OK, is a right of each
 * barber's login («Доступ» → the login; 19.11.2026). The client's reminder
 * (SMS, push or both) is in «Настройки → Уведомления» (round 11).
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { seenStaff } from "@/lib/auth/rights";
import { listRequests, weeklyHours } from "@/lib/barber/requests";
import type { WeekHours } from "@/lib/barber/request-words";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
import { Titled } from "../star";
import { RequestsView, type OpenExtra } from "./requests-view";

/** «История» goes this far back. */
const HISTORY_DAYS = 30;

export default function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  return (
    <main className="adm-page adm-wide">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/requests">["searchParams"] }) {
  const A = await getA();
  const R = A.req;
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const [{ user, business }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const tab = sp.tab === "history" ? "history" : "open";
  // only the barbers whose column this login sees (journal.staff): the server refuses an answer for the others anyway
  const seen = seenStaff(user);
  const rows = (await listRequests(query, business.id, { days: HISTORY_DAYS })).filter((r) => seen === "all" || seen.includes(r.staffId));
  const open = rows.filter((r) => r.status === "requested");
  const history = rows.filter((r) => r.status !== "requested");

  // «Было»: today's weekly hours of each barber who asks for new ones
  const extra: Record<string, OpenExtra> = {};
  if (tab === "open") {
    const was = new Map<string, Promise<WeekHours>>();
    const now = new Date();
    await Promise.all(
      open.map(async (r) => {
        if (r.what.kind === "hours") {
          if (!was.has(r.staffId)) was.set(r.staffId, weeklyHours(query, r.staffId));
          extra[r.id] = { was: await was.get(r.staffId)! };
        } else if (r.what.kind === "time_off" && r.visitsInside > 0) {
          // the visits a day off would leave in the journal: when, and where to find them
          const visits = await query<{ starts_at: Date }>(
            `select starts_at from appointments
              where staff_id = $1 and status in ('pending', 'booked', 'arrived')
                and starts_at < $3 and blocked_until > greatest($2::timestamptz, $4::timestamptz)
              order by starts_at limit 4`,
            [r.staffId, new Date(r.what.from), new Date(r.what.to), now],
          );
          extra[r.id] = { visits: visits.map((v) => new Date(v.starts_at).getTime()) };
        }
      }),
    );
  }

  return (
    <>
      <Title text={R.title} />
      <div className="rq-head">
        <Titled page="requests">
          <h1 className="adm-h1">{R.title}</h1>
        </Titled>
        <p className="ac-sub">{R.subtitle}</p>
      </div>
      <nav className="ac-tabs" aria-label={R.title}>
        <Link href="/admin/requests" prefetch={false} aria-current={tab === "open" ? "page" : undefined}>
          {R.open}
          {open.length > 0 && <span className="rq-pill">{open.length}</span>}
        </Link>
        <Link href="/admin/requests?tab=history" prefetch={false} aria-current={tab === "history" ? "page" : undefined}>
          {R.history} <span className="n">{R.days30}</span>
        </Link>
      </nav>
      <RequestsView tab={tab} rows={tab === "open" ? open : history} extra={extra} tz={business.timezone} />
    </>
  );
}
