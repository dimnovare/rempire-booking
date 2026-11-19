"use client";

/**
 * One invoice, laid out as Isolta's (docs/reference-looks.md): the title
 * and its buttons on top; then one sheet with who it is from and for, the
 * number and the dates on the right, the lines as a table, the totals and
 * the note.
 *
 * A draft's lines save by themselves (autosave.tsx), as the admin's other
 * edits; «Выставить и отправить», «Удалить черновик» and «Кредитовать» ask
 * first, because they cannot be taken back.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { amountText, bpText, euroText, parseCents } from "@/lib/money";
import { PlusIcon, PrevIcon } from "../../../icons";
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
  /** who it is from, as it is or will be printed */
  from: string;
  fromAddress: string;
  to: string;
  toAddress: string;
  email: string;
  /** the month it bills; "" for a free invoice */
  period: string;
  issuedOn: string;
  dueOn: string;
  /** a draft: the days the receiver has to pay */
  termsDays: number | null;
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
      <Link className="inv-back" href="/admin/invoices">
        <PrevIcon />
        {A.inv.back}
      </Link>
      <div className="inv-head">
        <div className="inv-title">
          <h1 className="adm-h1">{inv.number ? A.inv.one(inv.number) : A.inv.newInvoice}</h1>
          <span className="tags">
            {inv.kind === "credit" && <span className="adm-tag">{A.inv.credit}</span>}
            <StatusTag A={A} status={inv.status} />
          </span>
        </div>
        <div className="inv-acts">
          {draft ? (
            <>
              <AskButton
                label={A.inv.issueSend}
                yes={A.inv.issue}
                ask={A.inv.issueAsk(inv.email || "—")}
                className="adm-btn adm-btn-lime adm-btn-sm"
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
                  router.push("/admin/invoices");
                }}
              />
            </>
          ) : (
            <>
              {inv.kind === "invoice" && inv.status !== "credited" && <PaidButton id={inv.id} paid={inv.status === "paid"} />}
              <a className="adm-btn adm-btn-line adm-btn-sm" href={`/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noopener">
                {A.inv.pdf}
              </a>
              <button
                type="button"
                className="adm-btn adm-btn-line adm-btn-sm"
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
        </div>
      </div>
      {msg && (
        <p className="adm-ok" role="status">
          {msg}
        </p>
      )}
      {!draft && (
        <p className="adm-meta">
          {inv.sentOn ? A.inv.sentOn(inv.sentOn) : A.inv.notSent}
          {inv.emailStatus && inv.emailStatus !== "sent" ? `, ${A.inv.mail[inv.emailStatus] ?? inv.emailStatus}` : ""}
          {inv.paidOn ? `, ${A.inv.paidOn(inv.paidOn).toLocaleLowerCase()}` : ""}
        </p>
      )}

      <section className="inv-sheet">
        <div className="inv-parties">
          <div className="inv-who">
            <div className="inv-party">
              <small>{A.inv.from}</small>
              <b>{inv.from}</b>
              {inv.fromAddress && <span>{inv.fromAddress}</span>}
            </div>
            <div className="inv-party">
              <small>{A.inv.to}</small>
              <b>
                {inv.staffId ? (
                  <Link href={`/admin/invoices/barber/${inv.staffId}?m=${inv.month}`} prefetch={false}>
                    {inv.to}
                  </Link>
                ) : (
                  inv.to
                )}
              </b>
              {inv.toAddress && <span>{inv.toAddress}</span>}
              {inv.email && <span>{inv.email}</span>}
            </div>
          </div>
          <dl className="inv-meta">
            <div>
              <dt>{A.inv.number}</dt>
              <dd>{inv.number ?? <i>{A.inv.atIssue}</i>}</dd>
            </div>
            <div>
              <dt>{A.inv.issuedOn}</dt>
              <dd>{inv.issuedOn || <i>{A.inv.atIssue}</i>}</dd>
            </div>
            {inv.kind === "invoice" && (
              <div>
                <dt>{A.inv.dueOn}</dt>
                <dd>{inv.dueOn || (inv.termsDays != null ? <i>{A.inv.termsIn(inv.termsDays)}</i> : "")}</dd>
              </div>
            )}
            {inv.period && (
              <div>
                <dt>{A.inv.period}</dt>
                <dd>{inv.period}</dd>
              </div>
            )}
          </dl>
        </div>
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

        <div className="inv-lines-wrap">
          <div className="inv-row inv-row-head" aria-hidden="true">
            <span>{A.inv.lineName}</span>
            <span className="n">{A.inv.unitLong}</span>
            <span className="n">{A.inv.qty}</span>
            <span className="n">{A.inv.discount}</span>
            <span className="n">{A.inv.vat}</span>
            <span className="n">{A.inv.gross}</span>
            <span />
          </div>
          {draft ? (
            <>
              <ul className="inv-lines">
                {lines.map((l) => (
                  <DraftLine key={l.id} line={l} />
                ))}
              </ul>
              {lines.some((l) => l.saleId) && <p className="adm-meta">{A.inv.dropHint}</p>}
              <AddLine invoiceId={inv.id} startOpen={lines.length === 0} />
            </>
          ) : (
            <ul className="inv-lines">
              {lines.map((l) => (
                <li key={l.id} className="inv-row">
                  <span className="inv-c-text">{l.text}</span>
                  <span className="n" data-label={A.inv.unitLong}>
                    {amountText(l.unitCents)}
                  </span>
                  <span className="n" data-label={A.inv.qty}>
                    {l.qty}
                  </span>
                  <span className="n" data-label={A.inv.discount}>
                    {l.discountCents ? amountText(l.discountCents) : ""}
                  </span>
                  <span className="n" data-label={A.inv.vat}>
                    {bpText(l.vatBp)}
                  </span>
                  <b className="n">{euroText(l.grossCents)}</b>
                  <span />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="inv-foot">
          <div className="inv-note">{draft ? <DraftNote invoiceId={inv.id} note={inv.note} /> : inv.note && <p className="adm-note">{inv.note}</p>}</div>
          <dl className="inv-totals">
            <div>
              <dt>{A.inv.net}</dt>
              <dd>{euroText(inv.netCents)}</dd>
            </div>
            <div>
              <dt>{A.inv.vat}</dt>
              <dd>{euroText(inv.vatCents)}</dd>
            </div>
            <div className="tot">
              <dt>{A.inv.gross}</dt>
              <dd>{euroText(inv.grossCents)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}

function PaidButton({ id, paid }: { id: string; paid: boolean }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`adm-btn adm-btn-sm ${paid ? "adm-btn-line" : "adm-btn-lime"}`}
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

/** One line of a draft: a row of the table on a wide screen, a small form on a phone. */
function DraftLine({ line }: { line: ViewLine }) {
  const A = useA();
  const [d, setD] = useState<LineDraft>(() => lineOf(line));
  const [gone, setGone] = useState(false);
  const auto = useAutoSave<LineDraft>(d, setD, (v) => updateLineAction(line.id, parsedLine(v)!), { check: (v) => (parsedLine(v) ? null : A.inv.fail.invalid), label: line.text });
  const p = parsedLine(d);
  if (gone) return null;
  return (
    <li className="inv-row inv-edit" onBlur={auto.flush}>
      <label className="inv-c-text">
        <span>{A.inv.lineName}</span>
        <input aria-label={A.inv.text} value={d.text} maxLength={200} onChange={(e) => setD({ ...d, text: e.target.value })} />
        {line.kind !== "other" && <small>{A.inv.kind[line.kind] ?? line.kind}</small>}
      </label>
      <label>
        <span>{A.inv.unit}</span>
        <input inputMode="decimal" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
      </label>
      <label>
        <span>{A.inv.qty}</span>
        <input inputMode="numeric" value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
      </label>
      <label>
        <span>{A.inv.discount}</span>
        <input inputMode="decimal" value={d.discount} placeholder="0" onChange={(e) => setD({ ...d, discount: e.target.value })} />
      </label>
      <span className="n inv-c-vat" data-label={A.inv.vat}>
        {bpText(line.vatBp)}
      </span>
      <b className="n inv-c-sum">{p ? euroText(p.qty * p.unitCents - p.discountCents) : "—"}</b>
      <button
        type="button"
        className="adm-ibtn inv-c-x"
        aria-label={A.inv.drop}
        title={A.inv.drop}
        onClick={async () => {
          if (await dropLineAction(line.id).catch(() => false)) setGone(true);
        }}
      >
        ×
      </button>
      {(auto.phase === "bad" || auto.phase === "failed") && (
        <p className="adm-err inv-c-err" role="alert">
          {auto.phase === "bad" ? auto.text : A.auto.failed}
        </p>
      )}
    </li>
  );
}

function AddLine({ invoiceId, startOpen }: { invoiceId: string; startOpen: boolean }) {
  const A = useA();
  const empty: LineDraft = { text: "", qty: "1", unit: "", discount: "" };
  const [d, setD] = useState<LineDraft>(empty);
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="adm-btn adm-btn-line adm-btn-sm inv-add-btn" onClick={() => setOpen(true)}>
        <PlusIcon />
        {A.inv.addLine}
      </button>
    );
  return (
    <form
      className="inv-row inv-edit inv-add"
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
      <label className="inv-c-text">
        <span>{A.inv.lineName}</span>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input required autoFocus={!startOpen} aria-label={A.inv.text} maxLength={200} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
      </label>
      <label>
        <span>{A.inv.unit}</span>
        <input inputMode="decimal" required aria-label={A.inv.unit} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
      </label>
      <label>
        <span>{A.inv.qty}</span>
        <input inputMode="numeric" aria-label={A.inv.qty} value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
      </label>
      <div className="inv-add-btns">
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setOpen(false)}>
          {A.cancel}
        </button>
        <button type="submit" className="adm-btn adm-btn-lime adm-btn-sm" disabled={busy}>
          {A.inv.addLine}
        </button>
      </div>
      {err && (
        <p className="adm-err inv-c-err" role="alert">
          {err}
        </p>
      )}
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
