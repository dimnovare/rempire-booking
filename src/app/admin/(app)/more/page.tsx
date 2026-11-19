/**
 * /admin/more «Ещё»: the last tab of a phone's bottom bar (docs/apps.md,
 * «One app for Renat»). On top, who is signed in; then three groups of
 * rows, each row only with its right (src/lib/admin/app-nav.ts, moreOf):
 *
 *   - «Моё, как барбера», for a login linked to a barber: his time, a
 *     product sale, his sums. These are the barber app's own pages (/b),
 *     which open in this same frame with «Ещё» lit;
 *   - «Салон»: the sections that have no tab of their own, and «Продажа
 *     товара», which a wide screen has as a tile of its sidebar;
 *   - «Аккаунт»: the logins and rights, this device's notifications, the
 *     language, the way out.
 *
 * A wide screen has every section in the sidebar and no link to this page.
 */
import Link from "next/link";
import { Suspense } from "react";
import { moreOf, type MineRow, type SalonRow } from "@/lib/admin/app-nav";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { LANG_NAMES } from "../../copy";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { whoAmI } from "../who";
import { LangRow, LogoutRow } from "./account-rows";
import { SaleRow } from "./sale-row";

const MINE: Record<MineRow, string> = { time: "/b/time", sell: "/b/sell", money: "/b/money" };
const SALON: Record<Exclude<SalonRow, "sale">, string> = {
  staff: "/admin/staff",
  schedule: "/admin/schedule",
  services: "/admin/services",
  catalogue: "/admin/catalogue",
  records: "/admin/records",
  invoices: "/admin/invoices",
};

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
  const month = new Intl.DateTimeFormat(A.intl, { timeZone: business.timezone, month: "long" }).format(Date.now());
  const mineWords: Record<MineRow, [string, string]> = { time: [M.time, M.timeHint], sell: [M.sell, ""], money: [M.money, month] };
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
                  <b>{mineWords[k][0]}</b>
                  {mineWords[k][1] && <small>{mineWords[k][1]}</small>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.salon.length > 0 && (
        <section className="mo-group" aria-labelledby="mo-salon">
          <h2 id="mo-salon">{M.salonGroup}</h2>
          <ul className="mo-list">
            {rows.salon.map((k) => (
              <li key={k}>
                {k === "sale" ? (
                  <SaleRow />
                ) : (
                  <Link className="adm-item mo-row" href={SALON[k]} prefetch={false}>
                    <b>{A.nav[k]}</b>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mo-group" aria-labelledby="mo-account">
        <h2 id="mo-account">{M.accountGroup}</h2>
        <ul className="mo-list">
          {rows.account.map((k) => (
            <li key={k}>
              {k === "account" ? (
                <Link className="mo-row" href="/admin/account" prefetch={false}>
                  <b>{M.access}</b>
                </Link>
              ) : k === "notify" ? (
                // this device's notifications and the install guide live in the barber app's half
                <a className="mo-row" href="/b/more">
                  <b>{M.notify}</b>
                  <small>{M.notifyHint}</small>
                </a>
              ) : k === "language" ? (
                <LangRow current={LANG_NAMES[A.lang]} />
              ) : (
                <LogoutRow />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
