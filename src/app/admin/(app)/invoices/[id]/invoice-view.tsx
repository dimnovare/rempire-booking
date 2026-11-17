"use client";

/**
 * One invoice. A draft's lines save by themselves (autosave.tsx), as the
 * admin's other edits; «Выставить», «Удалить черновик» and «Кредитовать»
 * ask first, because they cannot be taken back.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { amountText, bpText, euroText, parseCents } from "@/lib/money";
import { PrevIcon } from "../../../icons";
import { useA } from "../../../lang";
import { useAutoSave } from "../../autosave";
import { addLineAction, creditAction, discardAction, dropLineAction, issueAction, resendAction, setNoteAction, setPaidAction, updateLineAction } from "../actions";
import { AskButton } from "../ask";
import { StatusTag } from "../common";

export type ViewInvoice = {
  id: string;
  status: string;
  kind: "invoice" | "credit";
  number: string | null;
  month: string;
  to: string;
  email: string;
  period: string;
  issuedOn: string;
  dueOn: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string;
  paidOn: string;
  sentOn: string;
  emailStatus: string | null;
  creditOf: { id: string; number: string } | null;
  creditedBy: { id: string; number: string } | null;
  staffId: string | null;
};

export type ViewLine = { id: string; kind: string; text: string; qty: number; unitCents: number; discountCents: number; vatBp: number; grossCents: number; saleId: string | null };

export function InvoiceView({ inv, lines }: { inv: ViewInvoice; lines: ViewLine[] }) {
  const A = useA();
  const router = useRouter();
  const draft = inv.status === "draft";
  const [msg, setMsg] = useState<string | null>(null);
  const fail = (code: string) => A.inv.fail[code] ?? A.error;

  return (
    <>
      <Link className="adm-back" href={`/admin/invoices?m=${inv.month}`}>
        <PrevIcon />
        {A.inv.back}
      </Link>
      <div className="adm-page-head">
        <h1 className="adm-h1">{inv.number ?? A.inv.draft}</h1>
        <span className="tags">
          {inv.kind === "credit" && <span className="adm-tag">{A.inv.credit}</span>}
          <StatusTag A={A} status={inv.status} />
        </span>
      </div>

      <div className="adm-two-cols">
        <section className="adm-card">
          <dl className="adm-inv-meta">
            <div>
              <dt>{A.inv.to}</dt>
              <dd>
                {inv.staffId ? (
                  <Link href={`/admin/invoices/barber/${inv.staffId}?m=${inv.month}`} prefetch={false}>
                    {inv.to}
                  </Link>
                ) : (
                  inv.to
                )}
                {inv.email && <small>{inv.email}</small>}
              </dd>
            </div>
            <div>
              <dt>{A.inv.period}</dt>
              <dd>{inv.period}</dd>
            </div>
            {inv.issuedOn && (
              <div>
                <dt>{A.inv.issuedOn}</dt>
                <dd>{inv.issuedOn}</dd>
              </div>
            )}
            {inv.dueOn && inv.kind === "invoice" && (
              <div>
                <dt>{A.inv.dueOn}</dt>
                <dd>{inv.dueOn}</dd>
              </div>
            )}
          </dl>
          {inv.creditOf && (
            <p className="adm-meta">
              <Link href={`/admin/invoices/${inv.creditOf.id}`}>{A.inv.creditOf(inv.creditOf.number)}</Link>
            </p>
          )}
          {inv.creditedBy && (
            <p className="adm-meta">
              <Link href={`/admin/invoices/${inv.creditedBy.id}`}>{A.inv.creditedBy(inv.creditedBy.number)}</Link>
            </p>
          )}
        </section>

        <section className="adm-card">
          <h2 className="adm-card-h">{A.inv.lines}</h2>
          {draft ? (
            <>
              <ul className="adm-inv-lines">
                {lines.map((l) => (
                  <DraftLine key={l.id} line={l} />
                ))}
              </ul>
              {lines.some((l) => l.saleId) && <p className="adm-meta">{A.inv.dropHint}</p>}
              <AddLine invoiceId={inv.id} />
            </>
          ) : (
            <ul className="adm-lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.text}
                    <small className="adm-inv-calc">
                      {l.qty} × {amountText(l.unitCents)}
                      {l.discountCents ? ` − ${amountText(l.discountCents)}` : ""} · {A.inv.vat} {bpText(l.vatBp)}
                    </small>
                  </span>
                  <span>{euroText(l.grossCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className="adm-lines adm-inv-totals">
            <li>
              <span>{A.inv.net}</span>
              <span>{euroText(inv.netCents)}</span>
            </li>
            <li>
              <span>{A.inv.vat}</span>
              <span>{euroText(inv.vatCents)}</span>
            </li>
            <li className="tot">
              <span>{A.inv.gross}</span>
              <span>{euroText(inv.grossCents)}</span>
            </li>
          </ul>
          {draft ? <DraftNote invoiceId={inv.id} note={inv.note} /> : inv.note && <p className="adm-note">{inv.note}</p>}
        </section>

        <section className="adm-card adm-inv-acts">
          {msg && (
            <p className="adm-ok" role="status">
              {msg}
            </p>
          )}
          {draft ? (
            <>
              <AskButton
                label={A.inv.issue}
                ask={A.inv.issueAsk(inv.email || "—")}
                className="adm-btn adm-btn-lime"
                disabled={!lines.length}
                onYes={async () => {
                  const r = await issueAction(inv.id);
                  if (!r.ok) return fail(r.code);
                  setMsg(A.inv.issued(r.number));
                }}
              />
              <AskButton
                label={A.inv.discard}
                ask={A.inv.discardAsk}
                className="adm-btn adm-btn-warn adm-btn-sm"
                onYes={async () => {
                  if (!(await discardAction(inv.id))) return A.inv.fail.not_draft;
                  router.push(`/admin/invoices?m=${inv.month}`);
                }}
              />
            </>
          ) : (
            <>
              <a className="adm-btn adm-btn-line" href={`/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noopener">
                {A.inv.pdf}
              </a>
              <p className="adm-meta">
                {inv.sentOn ? A.inv.sentOn(inv.sentOn) : A.inv.notSent}
                {inv.emailStatus && inv.emailStatus !== "sent" ? ` · ${A.inv.mail[inv.emailStatus] ?? inv.emailStatus}` : ""}
                {inv.paidOn ? ` · ${A.inv.paidOn(inv.paidOn)}` : ""}
              </p>
              {inv.kind === "invoice" && inv.status !== "credited" && (
                <PaidButton id={inv.id} paid={inv.status === "paid"} />
              )}
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={async () => {
                  setMsg((await resendAction(inv.id).catch(() => false)) ? A.inv.resent : A.error);
                }}
              >
                {A.inv.resend}
              </button>
              {inv.kind === "invoice" && inv.status !== "credited" && (
                <AskButton
                  label={A.inv.doCredit}
                  ask={A.inv.creditAsk}
                  className="adm-btn adm-btn-warn adm-btn-sm"
                  onYes={async () => {
                    const r = await creditAction(inv.id);
                    if (!r.ok) return fail(r.code);
                    router.push(`/admin/invoices/${r.id}`);
                  }}
                />
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function PaidButton({ id, paid }: { id: string; paid: boolean }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`adm-btn ${paid ? "adm-btn-ghost adm-btn-sm" : "adm-btn-lime"}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await setPaidAction(id, !paid).catch(() => false);
        setBusy(false);
      }}
    >
      {paid ? A.inv.unpaid : A.inv.paid}
    </button>
  );
}

type LineDraft = { text: string; qty: string; unit: string; discount: string };

const lineOf = (l: ViewLine): LineDraft => ({ text: l.text, qty: String(l.qty), unit: amountText(l.unitCents), discount: l.discountCents ? amountText(l.discountCents) : "" });

function parsedLine(d: LineDraft): { text: string; qty: number; unitCents: number; discountCents: number } | null {
  const qty = Number(d.qty);
  const unitCents = parseCents(d.unit);
  const discountCents = d.discount.trim() ? parseCents(d.discount) : 0;
  if (!d.text.trim() || !Number.isInteger(qty) || qty === 0 || unitCents == null || discountCents == null) return null;
  return { text: d.text, qty, unitCents, discountCents };
}

function DraftLine({ line }: { line: ViewLine }) {
  const A = useA();
  const [d, setD] = useState<LineDraft>(() => lineOf(line));
  const [gone, setGone] = useState(false);
  const auto = useAutoSave<LineDraft>(d, setD, (v) => updateLineAction(line.id, parsedLine(v)!), { check: (v) => (parsedLine(v) ? null : A.inv.fail.invalid), label: line.text });
  const p = parsedLine(d);
  if (gone) return null;
  return (
    <li className="adm-inv-line" onBlur={auto.flush}>
      <div className="adm-inv-line-head">
        <span className="adm-tag">{A.inv.kind[line.kind] ?? line.kind}</span>
        <span className="adm-tag">{bpText(line.vatBp)}</span>
        <b>{p ? euroText(p.qty * p.unitCents - p.discountCents) : "—"}</b>
        <button
          type="button"
          className="adm-ibtn"
          aria-label={A.inv.drop}
          title={A.inv.drop}
          onClick={async () => {
            if (await dropLineAction(line.id).catch(() => false)) setGone(true);
          }}
        >
          ×
        </button>
      </div>
      <input aria-label={A.inv.text} value={d.text} maxLength={200} onChange={(e) => setD({ ...d, text: e.target.value })} />
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.inv.qty}</span>
          <input inputMode="numeric" value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
        </label>
        <label className="adm-field">
          <span>{A.inv.unit}</span>
          <input inputMode="decimal" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
        </label>
        <label className="adm-field">
          <span>{A.inv.discount}</span>
          <input inputMode="decimal" value={d.discount} placeholder="0" onChange={(e) => setD({ ...d, discount: e.target.value })} />
        </label>
      </div>
      {(auto.phase === "bad" || auto.phase === "failed") && (
        <p className="adm-err" role="alert">
          {auto.phase === "bad" ? auto.text : A.auto.failed}
        </p>
      )}
    </li>
  );
}

function AddLine({ invoiceId }: { invoiceId: string }) {
  const A = useA();
  const empty: LineDraft = { text: "", qty: "1", unit: "", discount: "" };
  const [d, setD] = useState<LineDraft>(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={() => setOpen(true)}>
        {A.inv.addLine}
      </button>
    );
  return (
    <form
      className="adm-form adm-inv-add"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = parsedLine(d);
        if (!p) return setErr(A.inv.fail.invalid);
        setBusy(true);
        setErr(null);
        const r = await addLineAction(invoiceId, p).catch(() => ({ ok: false, field: "" }));
        setBusy(false);
        if (!r.ok) return setErr(A.inv.fail[r.field ?? ""] ?? A.error);
        setD(empty);
        setOpen(false);
      }}
    >
      <label className="adm-field">
        <span>{A.inv.text}</span>
        <input required maxLength={200} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
      </label>
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.inv.qty}</span>
          <input inputMode="numeric" value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
        </label>
        <label className="adm-field">
          <span>{A.inv.unit}</span>
          <input inputMode="decimal" required value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
        </label>
      </div>
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
      <div className="adm-bar-row">
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setOpen(false)}>
          {A.cancel}
        </button>
        <button type="submit" className="adm-btn adm-btn-lime adm-btn-sm" disabled={busy}>
          {A.inv.addLine}
        </button>
      </div>
    </form>
  );
}

function DraftNote({ invoiceId, note }: { invoiceId: string; note: string }) {
  const A = useA();
  const [v, setV] = useState(note);
  const auto = useAutoSave<string>(v, setV, (x) => setNoteAction(invoiceId, x), { label: A.inv.note });
  return (
    <label className="adm-field">
      <span>{A.inv.note}</span>
      <textarea rows={2} maxLength={300} value={v} onChange={(e) => setV(e.target.value)} onBlur={auto.flush} />
    </label>
  );
}
