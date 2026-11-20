/**
 * /admin/invoices/new «Новый счёт»: the invoice's sheet with nobody on it
 * yet. One field finds the receiver; his name opens the draft for him
 * (src/lib/billing/invoices.ts, openDraft): the one he has, else the month
 * being invoiced with its rent and sales already in, else an empty free
 * invoice dated today. A draft is always somebody's, so nothing is made
 * before he is picked.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listIssuers, listReceivers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { NewInvoiceView } from "./new-view";

export default function NewInvoicePage() {
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
  const { business } = await requireAdmin();
  const [receivers, issuers] = await Promise.all([listReceivers(query, business.id), listIssuers(query, business.id)]);
  const issuer = issuers.find((i) => i.isDefault && i.active) ?? null;
  return (
    <>
      <Title text={A.inv.newInvoice} />
      <NewInvoiceView
        issuer={issuer ? { name: issuer.legalName, address: issuer.address } : null}
        receivers={receivers.filter((r) => r.active).map((r) => ({ id: r.id, name: r.legalName, sub: [r.staffName, r.address || r.email].filter(Boolean).join(", "), person: r.kind === "person" }))}
      />
    </>
  );
}
