/**
 * /admin/more «Ещё»: the last tab of a phone's bottom bar (docs/apps.md,
 * «One app for Renat»; design artifact 53PfD3DxCRkbDyjwLVvBHB, Dim
 * 25.11.2026). On top, who is signed in; then three groups of rows, each
 * row only with its right (src/lib/admin/app-nav.ts, moreOf):
 *
 *   - «Моё, как барбера», for a login linked to a barber: his time, a
 *     product sale, his sums with this month's amount. These are the barber
 *     app's own pages (/b), which open in this same frame with «Ещё» lit;
 *   - «Салон»: the sections that have no tab of their own, in the order and
 *     the folds of the sidebar's menu (sections.tsx, MENU): «Отчёты»,
 *     «Сотрудники» and «Настройки» open their pages under them; «Запросы»
 *     with how many wait (the red dot on «Ещё» says the same); the salon's
 *     notifications as «Уведомления клиентам», apart from this phone's
 *     pushes; «Продажа товара», which a wide screen has as a sidebar tile;
 *   - «Мой вход»: the logins and rights, this phone's pushes, the language.
 *
 * Under them, apart and in red, «Выйти на этом телефоне». A wide screen has
 * every section in the sidebar and no link to this page.
 */
import Link from "next/link";
import { Suspense } from "react";
import { moreOf, type MineRow, type SalonRow, type SettingsRow } from "@/lib/admin/app-nav";
import { FAV_HREF } from "@/lib/admin/favourites";
import { requireAdmin } from "@/lib/auth/current";
import { monthStatement } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";
import { euroText } from "@/lib/money";
import { todayIn } from "@/lib/tz";
import { LANG_NAMES } from "../../copy";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { whoAmI } from "../who";
import { LangRow, LogoutButton, PushRow } from "./account-rows";
import { RequestsRow } from "./requests-row";
import { SaleRow } from "./sale-row";

const MINE: Record<MineRow, string> = { time: "/b/time", sell: "/b/sell", money: "/b/money" };
const HREF: Record<Exclude<SalonRow, "sale" | "requests">, string> = {
  staff: "/admin/staff",
  schedule: "/admin/schedule",
  services: "/admin/services",
  catalogue: "/admin/catalogue",
  analytics: "/admin/analytics",
  records: "/admin/records",
  reviews: "/admin/reviews",
  visits: "/admin/dashboard",
  messages: "/admin/messages",
  changes: "/admin/changes",
  invoices: "/admin/invoices",
  notifications: "/admin/notifications",
};
/** «Отчёты» and «Сотрудники» as the sidebar folds them; «Настройки» is moreOf's own group. */
const REPORTS = ["analytics", "records", "reviews", "visits", "messages", "changes"] as const;
const TEAM = ["staff", "schedule"] as const;

export default function MorePage() {
  return (
    <main className="adm-page adm-more">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const M = A.more;
  const rows = moreOf(user);
  const who = await whoAmI(A, user);
  const has = (k: SalonRow) => rows.salon.includes(k);
  const month = new Intl.DateTimeFormat(A.intl, { timeZone: business.timezone, month: "long" }).format(Date.now());
  // «Мои расчёты»: this month's amount, as his page opens with it
  let money = month;
  if (user.staffId && rows.mine.includes("money")) {
    const st = await monthStatement(query, business, user.staffId, todayIn(business.timezone).slice(0, 7));
    money = M.moneyHint(month, euroText(st.owedCents));
  }
  const mineWords: Record<MineRow, [string, string]> = { time: [M.time, M.timeHint], sell: [M.sell, M.sellHint], money: [M.money, money] };
  const page = (k: Exclude<SalonRow, "sale" | "requests">, label: string, hint?: string, sub?: boolean) => (
    <li key={k}>
      <Link className={`adm-item mo-row${sub ? " mo-sub" : ""}`} href={HREF[k]} prefetch={false}>
        <span className="tx">
          <b>{label}</b>
          {hint && <small>{hint}</small>}
        </span>
      </Link>
    </li>
  );
  const reports = REPORTS.filter(has);
  const team = TEAM.filter(has);

  return (
    <>
      {/* the page's name is for a screen reader and the browser tab: the head shows who is signed in */}
      <h1 className="sr">{M.title}</h1>
      <div className="mo-who">
        <span className="mo-ava" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {who.photoUrl ? <img src={who.photoUrl} alt="" /> : who.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <b>{who.name}</b>
          <span>{who.role}</span>
        </div>
      </div>

      {rows.mine.length > 0 && (
        <section className="mo-group" aria-labelledby="mo-mine">
          <h2 id="mo-mine">{M.mineGroup}</h2>
          <ul className="mo-list">
            {rows.mine.map((k) => (
              <li key={k}>
                {/* the barber app's half has its own root layout: a plain link */}
                <a className="mo-row" href={MINE[k]}>
                  <span className="tx">
                    <b>{mineWords[k][0]}</b>
                    {mineWords[k][1] && <small>{mineWords[k][1]}</small>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(rows.salon.length > 0 || rows.settings.length > 0) && (
        <section className="mo-group" aria-labelledby="mo-salon">
          <h2 id="mo-salon">{M.salonGroup}</h2>
          <ul className="mo-list">
            {reports.length > 0 && (
              <Fold label={A.nav.reports}>{reports.map((k) => page(k, A.nav[k], undefined, true))}</Fold>
            )}
            {team.length > 0 && (
              <Fold label={A.nav.team} hint={M.teamHint}>
                {team.map((k) => page(k, k === "staff" ? A.nav.staffList : A.nav.schedule, undefined, true))}
              </Fold>
            )}
            {has("services") && page("services", A.nav.services)}
            {has("catalogue") && page("catalogue", A.nav.catalogue)}
            {has("requests") && (
              <li>
                <RequestsRow />
              </li>
            )}
            {has("invoices") && page("invoices", A.nav.invoices)}
            {has("notifications") && page("notifications", M.notifySalon, M.notifySalonHint)}
            {rows.settings.length > 0 && (
              <Fold label={A.nav.settings} hint={M.settingsHint}>
                {rows.settings.map((k: SettingsRow) => (
                  <li key={k}>
                    <Link className="adm-item mo-row mo-sub" href={FAV_HREF[k]} prefetch={false}>
                      <span className="tx">
                        <b>{A.nav[k]}</b>
                      </span>
                    </Link>
                  </li>
                ))}
              </Fold>
            )}
            {has("sale") && (
              <li>
                <SaleRow />
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="mo-group" aria-labelledby="mo-account">
        <h2 id="mo-account">{M.accountGroup}</h2>
        <ul className="mo-list">
          {rows.account.includes("account") && (
            <li>
              <Link className="mo-row" href="/admin/account" prefetch={false}>
                <span className="tx">
                  <b>{M.access}</b>
                  <small>{M.accessHint}</small>
                </span>
              </Link>
            </li>
          )}
          {rows.account.includes("notify") && (
            <li>
              <PushRow />
            </li>
          )}
          {rows.account.includes("language") && (
            <li>
              <LangRow current={LANG_NAMES[A.lang]} />
            </li>
          )}
        </ul>
      </section>
      {rows.account.includes("logout") && <LogoutButton />}
    </>
  );
}

/** A row that opens its pages under it, as the sidebar's groups do («Отчёты», «Сотрудники», «Настройки»). */
function Fold({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <li>
      <details className="mo-fold">
        <summary className="mo-row">
          <span className="tx">
            <b>{label}</b>
            {hint && <small>{hint}</small>}
          </span>
        </summary>
        <ul className="mo-subs">{children}</ul>
      </details>
    </li>
  );
}
