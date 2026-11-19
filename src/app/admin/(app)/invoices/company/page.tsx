/**
 * /admin/invoices/company «Счета» → «Компания» (Phase C, C1): REMPIRE's
 * company that issues the invoices, its number series and the last number
 * from Isolta, and the money switches (the 17 %, its basis, the billing
 * day). The owner changes them; the front desk only reads.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listIssuers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { Titled } from "../../star";
import { InvTabs } from "../common";
import { CompanyView } from "./company-view";

export default function CompanyPage() {
  return (
    <main className="adm-page adm-wide adm-inv">
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
      <Title text={A.inv.company} />
      <div className="adm-page-head">
        <Titled page="invoices">
          <h1 className="adm-h1">{A.inv.title}</h1>
        </Titled>
      </div>
      <InvTabs A={A} here="company" />
      <CompanyView
        key={issuer?.id ?? "new"}
        issuer={issuer}
        year={year}
        owner={user.role === "owner"}
        money={{ commission_bp: s.commission_bp, commission_basis: s.commission_basis, billing_day: s.billing_day }}
      />
    </>
  );
}
