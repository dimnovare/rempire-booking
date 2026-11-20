"use client";

/**
 * An issued invoice: the same sheet, read only. The bar has «Платежи» (the
 * «оплачен» mark with its day), «Создать кредит-счёт» (asked first) and
 * «Инструменты» (a copy as a new draft, the PDF to save or print, the
 * letter once more). Under the bar the status in its own colours, with
 * «Показать действия по счёту»: issued, sent to which address, paid,
 * credited, as the audit log and the outbox kept them.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { amountText, bpText, euroText } from "@/lib/money";
import { useA } from "../../../lang";
import { useFrame } from "../../frame";
import { copyAction, creditAction, resendAction, setPaidAction } from "../actions";
import { INV_ROOT, statusWord, ToolIcon, type EventLine } from "../common";
import { MetaTable, ReceiverCard, SenderBlock, Totals, unitOf } from "../sheet-parts";
import { Confirm, Dialog, Field, IvTop, MenuButton } from "../ui";
import { DocBar, LinesHead, LinesHeadRow } from "./doc-parts";
import type { ViewInvoice, ViewLine } from "./types";

export function SentView({ inv, lines, events }: { inv: ViewInvoice; lines: ViewLine[]; events: EventLine[] }) {
  const A = useA();
  const router = useRouter();
  const frame = useFrame();
  const [paying, setPaying] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const [showing, setShowing] = useState(false);
  const fail = (code: string) => A.inv.fail[code] ?? A.error;
  const invoice = inv.kind === "invoice";
  const live = invoice && inv.status !== "credited";
  const pdf = `${INV_ROOT}/${inv.id}/pdf`;

  const copy = async () => {
    try {
      const r = await copyAction(inv.id);
      if (r.ok) return router.push(`${INV_ROOT}/${r.id}`);
      frame.say(fail(r.code), true);
    } catch {
      frame.say(A.error, true);
    }
  };
  const resend = async () => {
    const ok = await resendAction(inv.id).catch(() => false);
    frame.say(ok ? A.inv.resent : A.error, !ok);
  };

  const tone = inv.status === "paid" ? " is-ok" : inv.status === "overdue" ? " is-bad" : "";
  const facts = [
    inv.sentOn ? A.inv.sentOn(inv.sentOn) : A.inv.notSent,
    inv.emailStatus && inv.emailStatus !== "sent" ? (A.inv.mail[inv.emailStatus] ?? inv.emailStatus) : "",
    inv.paidOn ? A.inv.paidOn(inv.paidOn) : "",
  ].filter(Boolean);

  const meta: [string, React.ReactNode][] = [
    [A.inv.number, inv.number ?? ""],
    [A.inv.issuedOn, inv.issuedOn],
    ...(invoice && inv.termsDays != null ? ([[A.inv.payTerms, A.inv.days(inv.termsDays)]] as [string, React.ReactNode][]) : []),
    ...(invoice ? ([[A.inv.dueOn, inv.dueOn]] as [string, React.ReactNode][]) : []),
    ...(inv.period
      ? ([
          [
            A.inv.period,
            inv.staffId ? (
              <Link key="p" href={`${INV_ROOT}/barber/${inv.staffId}?m=${inv.month}`} prefetch={false}>
                {inv.period}
              </Link>
            ) : (
              inv.period
            ),
          ],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <>
      <IvTop title={invoice ? A.inv.one(inv.number ?? "") : A.inv.oneCredit(inv.number ?? "")}>
        {live && (
          <button type="button" className="iv-btn is-green" onClick={() => setPaying(true)}>
            {A.inv.payments}
          </button>
        )}
        {live && (
          <button type="button" className="iv-btn is-blue" onClick={() => setCrediting(true)}>
            {A.inv.createCredit}
          </button>
        )}
        <MenuButton label={A.inv.tools}>
          {(close) => (
            <>
              {invoice && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    void copy();
                  }}
                >
                  <ToolIcon name="copy" />
                  <span>
                    {A.inv.copy}
                    <small>{A.inv.copyHint}</small>
                  </span>
                </button>
              )}
              <a role="menuitem" href={`${pdf}?dl=1`} download onClick={close}>
                <ToolIcon name="pdf" />
                <span>{A.inv.savePdf}</span>
              </a>
              <a role="menuitem" href={pdf} target="_blank" rel="noopener" onClick={close}>
                <ToolIcon name="print" />
                <span>{A.inv.print}</span>
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  void resend();
                }}
              >
                <ToolIcon name="mail" />
                <span>{A.inv.resend}</span>
              </button>
            </>
          )}
        </MenuButton>
      </IvTop>

      <div className="iv-body is-doc">
        <DocBar prev={inv.prev} next={inv.next} />
        <div className="iv-banner-wrap">
          <div className={`iv-banner${tone}`} role="status">
            <b className={`inv-banner-st st-${inv.status}`}>{statusWord(A, inv.status)}</b>
            <span>
              {facts.join(", ")}
              {inv.creditOf && (
                <>
                  {facts.length ? ". " : ""}
                  <Link href={`${INV_ROOT}/${inv.creditOf.id}`}>{A.inv.creditOf(inv.creditOf.number)}</Link>
                </>
              )}
              {inv.creditedBy && (
                <>
                  {facts.length ? ". " : ""}
                  <Link href={`${INV_ROOT}/${inv.creditedBy.id}`}>{A.inv.creditedBy(inv.creditedBy.number)}</Link>
                </>
              )}
            </span>
            <button type="button" className="iv-chip" aria-expanded={showing} onClick={() => setShowing(!showing)}>
              {A.inv.showEvents}
            </button>
          </div>
          {showing && (
            <div className="iv-pop" role="region" aria-label={A.inv.eventsTitle}>
              <h3>{A.inv.eventsTitle}</h3>
              {events.length === 0 ? (
                <p className="iv-mute">{A.inv.desk.noEvents}</p>
              ) : (
                <ul className="iv-events">
                  {events.map((e) => (
                    <li key={e.key}>
                      <time>{e.when}</time>
                      <span>{e.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <section className="inv-sheet">
          <div className="inv-parties">
            <div className="inv-who">
              <SenderBlock name={inv.from} address={inv.fromAddress} />
              <ReceiverCard r={inv.receiver} />
            </div>
            <div className="inv-side">
              <MetaTable rows={meta} />
            </div>
          </div>

          <LinesHead count={lines.length} />
          <div className="inv-lines-wrap">
            <LinesHeadRow />
            <ul className="inv-lines">
              {lines.map((l) => (
                <li key={l.id} className="inv-row">
                  <span className="inv-c-no">{l.itemNo}</span>
                  <span className="c inv-c-text">
                    <span>{A.inv.lineName}</span>
                    {l.text}
                  </span>
                  <span className="c n">
                    <span>{A.inv.unitLong}</span>
                    {amountText(l.unitCents)}
                    <small>{l.vatBp ? A.inv.vatOf(bpText(l.vatBp)) : A.inv.noVat}</small>
                  </span>
                  <span className="c n">
                    <span>{A.inv.qty}</span>
                    {l.qty}
                  </span>
                  <span className="c">
                    <span>{A.inv.unitCol}</span>
                    {unitOf(A, l.kind)}
                  </span>
                  <span className="c n">
                    <span>{A.inv.discount}</span>
                    {l.discountCents ? amountText(l.discountCents) : ""}
                  </span>
                  <b className="n inv-c-sum">{amountText(l.grossCents)}</b>
                  <span />
                </li>
              ))}
            </ul>
          </div>

          <div className="inv-foot">
            <Totals netCents={inv.netCents} vatCents={inv.vatCents} grossCents={inv.grossCents} />
          </div>

          {inv.note && (
            <div className="inv-after">
              {A.inv.afterLines}
              <div>{inv.note}</div>
            </div>
          )}
        </section>
      </div>

      {paying && <Payments inv={inv} onClose={() => setPaying(false)} />}
      {crediting && (
        <Confirm
          title={A.inv.createCredit}
          ask={A.inv.creditAsk}
          yes={A.inv.createCredit}
          onClose={() => setCrediting(false)}
          onYes={async () => {
            const r = await creditAction(inv.id);
            if (!r.ok) return fail(r.code);
            router.push(`${INV_ROOT}/${r.id}`);
          }}
        />
      )}
    </>
  );
}

/**
 * «Платежи»: the invoice is paid in full on a day, or it is not; a part of
 * it is never recorded. Paid already, the window says when and offers to
 * take the mark off (a tap by mistake).
 */
function Payments({ inv, onClose }: { inv: ViewInvoice; onClose: () => void }) {
  const A = useA();
  const paid = inv.status === "paid";
  const [day, setDay] = useState(inv.today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async (to: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await setPaidAction(inv.id, to, to ? day : null);
      if (r.ok) return onClose();
      setErr(r.code === "date" ? A.inv.badDate : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <Dialog
      title={A.inv.payments}
      onClose={() => !busy && onClose()}
      foot={
        <button type="button" className="iv-btn" disabled={busy} onClick={onClose}>
          {A.close}
        </button>
      }
    >
      {paid ? (
        <>
          <p>{A.inv.paidLine(inv.paidOn, euroText(inv.grossCents))}</p>
          <p>
            <button type="button" className="iv-btn is-red" disabled={busy} onClick={() => void go(false)}>
              {A.inv.unpaid}
            </button>
          </p>
        </>
      ) : (
        <>
          <h3 className="iv-h6">{A.inv.addPayment}</h3>
          <div className="iv-fields">
            <Field label={A.inv.paidSum}>
              <input readOnly value={euroText(inv.grossCents)} />
            </Field>
            <Field label={A.inv.paidDate}>
              <input type="date" required min={inv.issuedIso || undefined} max={inv.today} value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
          </div>
          <p className="iv-mute">{A.inv.paymentHint}</p>
          <p>
            <button type="button" className="iv-btn is-main" disabled={busy || !day} onClick={() => void go(true)}>
              {A.inv.addPayment}
            </button>
          </p>
        </>
      )}
      {err && (
        <p className="iv-err" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}
