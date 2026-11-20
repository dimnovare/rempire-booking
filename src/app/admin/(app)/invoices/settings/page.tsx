/**
 * /admin/invoices/settings «Настройки» (it was the tab «Компания» at
 * /admin/invoices/company, which leads here now): REMPIRE's company that
 * issues the invoices, its bank account, the number series and the last
 * number from the program used before, the VAT rate and the text at the
 * foot of an invoice, and the money switches (the barber's share, what it
 * is counted on, the day the drafts are made). Laid out as the invoicing
 * tool's settings cards; nothing is here that we did not store already.
 * The owner changes them; the front desk only reads.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listIssuers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { SettingsView } from "./settings-view";

export default function SettingsPage() {
  return (
    <main className="iv-page">
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
  const year = Number(todayIn(business.timezone).slice(0, 4));
  const issuers = await listIssuers(query, business.id, year);
  const issuer = issuers.find((i) => i.isDefault) ?? issuers[0] ?? null;
  const s = business.settings;
  return (
    <>
      <Title text={A.inv.menu.settings} />
      <SettingsView key={issuer?.id ?? "new"} issuer={issuer} year={year} owner={user.role === "owner"} money={{ commission_bp: s.commission_bp, commission_basis: s.commission_basis, billing_day: s.billing_day }} />
    </>
  );
}
