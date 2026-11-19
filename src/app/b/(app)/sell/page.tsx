/**
 * /b/sell «Продать» (Phase C, C3 and C7): scan, search or photograph a shop
 * product, to a client or for himself, see the price and his 17 % before
 * the tap, and undo within a few minutes. Today's sales are under it.
 */
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { bpText } from "@/lib/money";
import { listSales, SALES } from "@/lib/sales";
import { shopMode } from "@/lib/shop";
import { addDays, startOfDay, todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { NoRights } from "../may";
import { Title } from "../title";
import { SellView } from "./sell-view";

export default function SellPage() {
  return (
    <Suspense fallback={<Wait />}>
      <Sell />
    </Suspense>
  );
}

async function Sell() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user, business, staff } = await requireStaff();
  // «Проводить продажу товаров»
  if (!can(user, "visit.sell")) return <NoRights />;
  const tz = business.timezone;
  const now = Date.now();
  const today = todayIn(tz, now);
  const sales = await listSales(query, staff.id, new Date(startOfDay(today, tz)), new Date(startOfDay(addDays(today, 1), tz)));
  return (
    <>
      <Title text={B.sell.title} />
      <SellView
        key={staff.id}
        staffId={staff.id}
        now={now}
        tz={tz}
        pct={bpText(business.settings.commission_bp)}
        undoMin={SALES.undoMin}
        maxQty={SALES.maxQty}
        demo={shopMode() === "fake"}
        today={sales.map((s) => ({
          ref: s.ref,
          name: s.name,
          qty: s.qty,
          mode: s.mode,
          totalCents: s.totalCents,
          commissionCents: s.commissionCents,
          status: s.status,
          sync: s.syncStatus,
          noPurchase: s.noPurchase,
          at: s.createdAt,
          reversal: s.reversesId !== null,
        }))}
      />
    </>
  );
}
