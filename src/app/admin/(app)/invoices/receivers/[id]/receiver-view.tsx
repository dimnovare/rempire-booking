"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPTY_QUERY, type ListRow } from "@/lib/billing/list";
import type { Receiver, Rent } from "@/lib/billing/parties";
import { amountText, euroText, parseCents } from "@/lib/money";
import { PlusIcon, PrevIcon } from "../../../../icons";
import { useA } from "../../../../lang";
import { useFrame } from "../../../frame";
import { newInvoiceAction, setRentAction } from "../../actions";
import { dmy, INV_ROOT, PartyIcon, type EventLine } from "../../common";
import { InvoiceList } from "../../list-view";
import { Field, IvTop } from "../../ui";
import { ReceiverDialog, type Opt } from "../receiver-dialog";

type Tab = "log" | "invoices";

export function ReceiverView({
  tab0 = "log",
  receiver,
  rows,
  today,
  events,
  rents,
  staff,
  issuers,
  canInvoice,
}: {
  /** the tab it opens on */
  tab0?: Tab;
  receiver: Receiver;
  rows: ListRow[];
  today: string;
  events: EventLine[];
  rents: Rent[];
  staff: (Opt & { active: boolean })[];
  issuers: Opt[];
  canInvoice: boolean;
}) {
  const A = useA();
  const R = A.inv.rcv;
  const router = useRouter();
  const frame = useFrame();
  const [tab, setTab] = useState<Tab>(tab0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const LOCALE: Record<string, string> = { et: "Eesti", ru: "Русский", en: "English" };

  const invoice = async () => {
    setBusy(true);
    try {
      const r = await newInvoiceAction(receiver.id);
      if (r.ok) return router.push(`${INV_ROOT}/${r.id}`);
      frame.say(A.inv.fail[r.code] ?? A.error, true);
    } catch {
      frame.say(A.error, true);
    }
    setBusy(false);
  };

  const read = (label: string, value: React.ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <>
      <IvTop title={receiver.legalName} sub={receiver.active ? undefined : A.inv.off}>
        <button type="button" className="iv-btn is-main" disabled={!canInvoice || busy} onClick={() => void invoice()}>
          <PlusIcon />
          {A.inv.newInvoice}
        </button>
      </IvTop>
      <div className="iv-body is-doc">
        <div className="iv-bar2">
          <Link className="iv-btn is-sm" href={`${INV_ROOT}/receivers`} prefetch={false}>
            <PrevIcon size={14} />
            {R.back}
          </Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section className="iv-card">
            <div className="iv-card-head">
              <span className="iv-tile-ico" aria-hidden="true">
                <PartyIcon person={receiver.kind === "person"} />
              </span>
              <h2>{receiver.legalName}</h2>
              <button type="button" className="iv-btn" onClick={() => setEditing(true)}>
                {R.edit}
              </button>
            </div>
            <h3 className="iv-h6">{R.billing}</h3>
            <dl className="iv-read">
              {read(A.inv.address, receiver.address)}
              {read(A.inv.regCode, receiver.regCode)}
              {read(A.inv.vatNumber, receiver.vatNumber)}
              {read(R.kind, A.inv.kinds[receiver.kind])}
              {read(A.inv.vatMode, receiver.vatMode === "vat" ? A.inv.vatOn : A.inv.vatOff)}
              {read(A.inv.payTerms, A.inv.days(receiver.termsDays))}
            </dl>
            <h3 className="iv-h6">{R.contact}</h3>
            <dl className="iv-read">
              {read(A.inv.staff, receiver.staffName ?? A.inv.noStaff)}
              {read(A.inv.email, receiver.email)}
              {read(A.inv.phone, receiver.phone)}
              {read(A.inv.locale, LOCALE[receiver.locale] ?? receiver.locale)}
            </dl>
          </section>

          <RentCard staffId={receiver.staffId} rents={rents} today={today} />

          <section className="iv-card">
            <div className="iv-tabs" role="tablist">
              {(["log", "invoices"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {R.tabs[t]}
                  {t === "invoices" ? ` (${rows.length})` : ""}
                </button>
              ))}
            </div>
            {tab === "log" ? (
              events.length === 0 ? (
                <p className="iv-mute">{R.noLog}</p>
              ) : (
                <div className="iv-tablewrap">
                  <table className="iv-table">
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: 180 }}>
                          {R.logAt}
                        </th>
                        <th scope="col">{R.logWhat}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.key}>
                          <td>{e.when}</td>
                          <td>
                            {e.href ? (
                              <Link className="iv-link" href={e.href} prefetch={false}>
                                {e.text}
                              </Link>
                            ) : (
                              e.text
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <InvoiceList embedded rows={rows} today={today} initial={EMPTY_QUERY} />
            )}
          </section>
        </div>
      </div>
      {editing && (
        <ReceiverDialog
          receiver={receiver}
          staff={staff}
          issuers={issuers}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            frame.say(R.saved);
          }}
        />
      )}
    </>
  );
}

/** The barber's chair rent: an amount a month from a day on; a new amount never rewrites an invoiced month. */
function RentCard({ staffId, rents, today }: { staffId: string | null; rents: Rent[]; today: string }) {
  const A = useA();
  // rents come newest first: the first one already started is the one in force
  const now = rents.find((r) => r.validFrom <= today) ?? null;
  const [amount, setAmount] = useState(now ? amountText(now.amountCents) : "");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!staffId)
    return (
      <section className="iv-card">
        <h2 className="iv-h6">{A.inv.rent}</h2>
        <p className="iv-mute">{A.inv.needStaff}</p>
      </section>
    );
  const save = async () => {
    const cents = parseCents(amount);
    if (cents == null || cents < 0) return setMsg({ ok: false, text: A.inv.bad("amountCents") });
    setBusy(true);
    setMsg(null);
    try {
      const r = await setRentAction(staffId, cents, from);
      setMsg(r.ok ? { ok: true, text: A.inv.rentSaved } : { ok: false, text: A.inv.bad(r.field) });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };
  return (
    <section className="iv-card">
      <h2 className="iv-h6">{A.inv.rent}</h2>
      <p>{now ? A.inv.rentNow(euroText(now.amountCents), dmy(now.validFrom)) : A.inv.noRent}</p>
      {rents
        .filter((r) => r.validFrom > today)
        .reverse()
        .map((r) => (
          <p key={r.id} className="iv-ok">
            {A.inv.rentNext(euroText(r.amountCents), dmy(r.validFrom))}
          </p>
        ))}
      <div className="iv-fields">
        <Field label={A.inv.rentAmount}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={A.inv.rentFrom}>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
      </div>
      {msg && (
        <p className={msg.ok ? "iv-ok" : "iv-err"} role="status">
          {msg.text}
        </p>
      )}
      <p>
        <button type="button" className="iv-btn" disabled={busy} onClick={() => void save()}>
          {A.inv.setRent}
        </button>
      </p>
      {rents.length > 1 && (
        <details>
          <summary className="iv-mute">{A.inv.rentHistory}</summary>
          <ul className="iv-events" style={{ marginTop: 8 }}>
            {rents.map((r) => (
              <li key={r.id}>
                <time>{dmy(r.validFrom)}</time>
                <span>{euroText(r.amountCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
