"use client";

/**
 * A draft, the editor, to the design board «Счёт, черновик»: the bar with
 * «Посмотреть и отправить счёт», «Заметка к счёту» and «Инструменты»; the
 * second bar; then one sheet with the sender, the receiver's card (× finds
 * another), the ruled table on the right, the lines and the totals.
 *
 * A line that exists saves by itself (autosave.tsx), as the admin's other
 * edits. A line's name is a search over the shop's products and the
 * salon's services (docs/one-place.md), and takes any typed text; picking
 * fills the name and the price, and the server sets the VAT rate by the
 * invoice's own rule. «Посмотреть и отправить счёт» shows the draft's PDF
 * (no number, the draft stamp); only «Выставить и отправить» there issues.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LineItem, LinePick } from "@/lib/billing/picker";
import { amountText, bpText, euroText, parseCents } from "@/lib/money";
import { PlusIcon, XIcon } from "../../../icons";
import { useA } from "../../../lang";
import { useAutoSave } from "../../autosave";
import { useFrame } from "../../frame";
import { addLineAction, changeReceiverAction, copyAction, discardAction, dropLineAction, findLineItemsAction, issueAction, setNoteAction, updateLineAction } from "../actions";
import { INV_ROOT, StatusTag, ToolIcon } from "../common";
import { MetaTable, ReceiverCard, ReceiverPicker, SenderBlock, Totals, unitOf, type PickReceiver } from "../sheet-parts";
import { Blocked, Confirm, Dialog, Field, IvTop, MenuButton } from "../ui";
import { DocBar, LinesHead, LinesHeadRow } from "./doc-parts";
import type { ViewInvoice, ViewLine } from "./types";

/** invoices.note's limit, INVOICE_NOTE_MAX in src/lib/billing/invoices.ts (045), as Isolta's. */
const NOTE_MAX = 4000;

export function DraftView({ inv, lines, receivers }: { inv: ViewInvoice; lines: ViewLine[]; receivers: PickReceiver[] }) {
  const A = useA();
  const router = useRouter();
  const frame = useFrame();
  const [changing, setChanging] = useState(false);
  const [rcvErr, setRcvErr] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [asking, setAsking] = useState(false);
  // an empty draft opens with its first line ready to type
  const [adding, setAdding] = useState(lines.length === 0);
  const [dirty, setDirty] = useState(false);
  const fail = (code: string) => A.inv.fail[code] ?? A.error;
  const later = <i>{A.inv.atIssue}</i>;

  const pickReceiver = async (id: string) => {
    setRcvErr(null);
    try {
      const r = await changeReceiverAction(inv.id, id);
      if (!r.ok) return setRcvErr(fail(r.code));
      // a month's draft stays his: the other receiver's own draft opens instead
      if (r.open) return router.push(`${INV_ROOT}/${r.open}`);
      setChanging(false);
    } catch {
      setRcvErr(A.error);
    }
  };

  const copy = async () => {
    try {
      const r = await copyAction(inv.id);
      if (r.ok) return router.push(`${INV_ROOT}/${r.id}`);
      frame.say(fail(r.code), true);
    } catch {
      frame.say(A.error, true);
    }
  };

  // the number it would get now, as Isolta's draft shows it; nothing is reserved, so it says so
  const meta: [string, React.ReactNode][] = [
    [
      A.inv.number,
      inv.upcoming ? (
        <>
          {inv.upcoming}
          <i style={{ display: "block", fontSize: 12, lineHeight: "16px" }}>{A.inv.notReserved}</i>
        </>
      ) : (
        later
      ),
    ],
    [A.inv.reference, inv.reference || later],
    [A.inv.issuedOn, later],
    ...(inv.termsDays != null ? ([[A.inv.payTerms, A.inv.days(inv.termsDays)]] as [string, React.ReactNode][]) : []),
    [A.inv.dueOn, inv.termsDays != null ? <i>{A.inv.termsIn(inv.termsDays)}</i> : later],
    ...(inv.period ? ([[A.inv.period, inv.period]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <>
      <IvTop title={inv.upcoming ? A.inv.one(inv.upcoming) : A.inv.newInvoice}>
        <button type="button" className="iv-btn is-main" disabled={!lines.length || (adding && dirty)} onClick={() => setPreviewing(true)}>
          {A.inv.preview}
        </button>
        <button type="button" className="iv-btn" onClick={() => setNoting(true)}>
          {A.inv.note}
        </button>
        <MenuButton label={A.inv.tools}>
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className="is-red"
                onClick={() => {
                  close();
                  setAsking(true);
                }}
              >
                <ToolIcon name="bin" />
                <span>{A.inv.discard}</span>
              </button>
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
            </>
          )}
        </MenuButton>
      </IvTop>

      <div className="iv-body is-doc">
        <DocBar prev={inv.prev} next={inv.next} />
        {inv.blocked && <Blocked code={inv.blocked} />}
        <section className="inv-sheet">
          <div className="inv-parties">
            <div className="inv-who">
              <SenderBlock name={inv.from} address={inv.fromAddress} />
              {changing ? (
                <ReceiverPicker
                  receivers={receivers}
                  onPick={pickReceiver}
                  err={rcvErr}
                  note={inv.free ? undefined : A.inv.monthStays(inv.receiver.name)}
                  onCancel={() => {
                    setRcvErr(null);
                    setChanging(false);
                  }}
                />
              ) : (
                <ReceiverCard r={inv.receiver} onChange={() => setChanging(true)} />
              )}
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
                <DraftLine key={l.id} line={l} />
              ))}
            </ul>
            {lines.some((l) => l.saleId) && <p className="inv-hint">{A.inv.dropHint}</p>}
            {adding && <NewLine invoiceId={inv.id} count={lines.length} onDirty={setDirty} onClose={() => setAdding(false)} />}
          </div>

          <div className="inv-foot">
            <button type="button" className="iv-btn is-main" disabled={adding} onClick={() => setAdding(true)}>
              <PlusIcon />
              {A.inv.addLine}
            </button>
            <Totals netCents={inv.netCents} vatCents={inv.vatCents} grossCents={inv.grossCents} />
          </div>

          {/* the note is for the staff only, never printed: shown here once there is one */}
          {inv.note && (
            <div className="inv-after inv-memo">
              {A.inv.noteTitle}
              <button type="button" aria-label={`${A.inv.noteTitle}: ${inv.note}`} onClick={() => setNoting(true)}>
                {inv.note}
              </button>
            </div>
          )}
        </section>
      </div>

      {noting && <NoteDialog invoiceId={inv.id} note={inv.note} onClose={() => setNoting(false)} />}
      {previewing && <PreviewDialog inv={inv} onClose={() => setPreviewing(false)} />}
      {asking && (
        <Confirm
          title={A.inv.discard}
          ask={A.inv.discardAsk}
          yes={A.inv.discard}
          danger
          onClose={() => setAsking(false)}
          onYes={async () => {
            if (!(await discardAction(inv.id))) return A.inv.fail.not_draft;
            router.push(INV_ROOT);
          }}
        />
      )}
    </>
  );
}

/* ---------- a line's name: the two lists, or typed ---------- */

/** After the last keystroke, before the lists are asked. */
const DELAY = 250;

function NamePicker({ value, label, autoFocus, onType, onPick }: { value: string; label: string; autoFocus?: boolean; onType: (text: string) => void; onPick: (item: LineItem) => void }) {
  const A = useA();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [look, setLook] = useState<"idle" | "looking" | "done">("idle");
  const [shopDown, setShopDown] = useState(false);
  const seq = useRef(0);

  // the lists are asked only for what is being typed, never for a name that is merely there
  useEffect(() => {
    const s = value.trim();
    if (!open || s.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      const r = await findLineItemsAction(s).catch(() => ({ items: [] as LineItem[], shopDown: true }));
      if (n !== seq.current) return;
      setItems(r.items);
      setShopDown(r.shopDown);
      setLook("done");
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [value, open]);

  const shown = open && value.trim().length >= 2 && look !== "idle";
  return (
    <span className="inv-combo">
      <input
        role="combobox"
        aria-expanded={shown}
        aria-autocomplete="list"
        aria-label={label}
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        maxLength={200}
        placeholder={A.inv.pickHint}
        value={value}
        onChange={(e) => {
          seq.current++;
          setLook("idle");
          setOpen(true);
          onType(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        onBlur={() => setOpen(false)}
      />
      {shown && (
        <ul className="inv-pick" role="listbox" aria-label={label}>
          {items.map((it) => (
            <li key={it.key} role="option" aria-selected="false" data-source={it.source}>
              {/* the field keeps the focus while an item is tapped */}
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onPick(it);
                }}
              >
                <span className="n">
                  <b>{it.name}</b>
                  <small>{A.inv.pickFrom[it.source]}</small>
                </span>
                <span className="p">{euroText(it.priceCents)}</span>
              </button>
            </li>
          ))}
          {look === "looking" && items.length === 0 && <li className="is-info">{A.loading}</li>}
          {look === "done" && items.length === 0 && !shopDown && <li className="is-info">{A.inv.pickNone}</li>}
          {look === "done" && shopDown && <li className="is-info">{A.inv.pickShopDown}</li>}
        </ul>
      )}
    </span>
  );
}

const pickOf = (it: LineItem): LinePick => (it.source === "product" ? { source: "product", productId: it.productId, variant: it.variant } : { source: "service", serviceId: it.serviceId });

type LineDraft = { text: string; qty: string; unit: string; discount: string; pick: LinePick | null };

const lineOf = (l: ViewLine): LineDraft => ({ text: l.text, qty: String(l.qty), unit: amountText(l.unitCents), discount: l.discountCents ? amountText(l.discountCents) : "", pick: null });

function parsedLine(d: LineDraft): { text: string; qty: number; unitCents: number; discountCents: number } | null {
  const qty = Number(d.qty);
  const unitCents = parseCents(d.unit);
  const discountCents = d.discount.trim() ? parseCents(d.discount) : 0;
  if (!d.text.trim() || !Number.isInteger(qty) || qty === 0 || unitCents == null || discountCents == null) return null;
  return { text: d.text, qty, unitCents, discountCents };
}

/** One line of a draft: a row of the table when the sheet is wide, a small form when it is not. */
function DraftLine({ line }: { line: ViewLine }) {
  const A = useA();
  const [d, setD] = useState<LineDraft>(() => lineOf(line));
  const [gone, setGone] = useState(false);
  const auto = useAutoSave<LineDraft>(d, setD, (v) => updateLineAction(line.id, parsedLine(v)!, v.pick), { check: (v) => (parsedLine(v) ? null : A.inv.fail.invalid), label: line.text });
  const p = parsedLine(d);
  // a sale's or the rent's own line keeps what it bills: only a typed line is picked from the lists
  const typed = line.kind === "other";
  if (gone) return null;
  return (
    <li className="inv-row inv-edit" onBlur={auto.flush}>
      <span className="inv-c-no">{line.itemNo}</span>
      <label className="inv-c-text">
        <span>{A.inv.lineName}</span>
        {typed ? (
          <NamePicker value={d.text} label={A.inv.text} onType={(text) => setD({ ...d, text, pick: null })} onPick={(it) => setD({ ...d, text: it.name, unit: amountText(it.priceCents), pick: pickOf(it) })} />
        ) : (
          <input aria-label={A.inv.text} value={d.text} maxLength={200} onChange={(e) => setD({ ...d, text: e.target.value })} />
        )}
        {!typed && <small>{A.inv.kind[line.kind] ?? line.kind}</small>}
      </label>
      <label className="n">
        <span>{A.inv.unitLong}</span>
        <input inputMode="decimal" aria-label={A.inv.unit} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
        <small>{line.vatBp ? A.inv.vatOf(bpText(line.vatBp)) : A.inv.noVat}</small>
      </label>
      <label className="n">
        <span>{A.inv.qty}</span>
        <input inputMode="numeric" aria-label={A.inv.qty} value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
      </label>
      <span className="c">
        <span>{A.inv.unitCol}</span>
        {unitOf(A, line.kind)}
      </span>
      <label className="n">
        <span>{A.inv.discount}</span>
        <input inputMode="decimal" aria-label={A.inv.discount} value={d.discount} placeholder="" onChange={(e) => setD({ ...d, discount: e.target.value })} />
      </label>
      <b className="n inv-c-sum">{p ? amountText(p.qty * p.unitCents - p.discountCents) : "—"}</b>
      <button
        type="button"
        className="iv-ibtn inv-c-x"
        aria-label={A.inv.drop}
        title={A.inv.drop}
        onClick={async () => {
          if (await dropLineAction(line.id).catch(() => false)) setGone(true);
        }}
      >
        <XIcon size={18} />
      </button>
      {(auto.phase === "bad" || auto.phase === "failed") && (
        <p className="iv-err inv-c-err" role="alert">
          {auto.phase === "bad" ? auto.text : A.auto.failed}
        </p>
      )}
    </li>
  );
}

const EMPTY: LineDraft = { text: "", qty: "1", unit: "", discount: "", pick: null };

/**
 * A line being added, under the others. It is saved by its own button, by
 * Enter, by picking an item from the lists (the name and the price are then
 * both there), or when it is left with a name and a price in it.
 */
function NewLine({ invoiceId, count, onDirty, onClose }: { invoiceId: string; count: number; onDirty: (dirty: boolean) => void; onClose: () => void }) {
  const A = useA();
  const [d, setD] = useState<LineDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sent = useRef(false);
  const sending = useRef(false);
  const dirty = d.text.trim() !== "" || d.unit.trim() !== "";
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const save = async (v: LineDraft, quiet = false) => {
    const p = parsedLine(v);
    if (!p) return quiet ? undefined : setErr(A.inv.fail.invalid);
    if (sending.current || sent.current) return;
    sending.current = true;
    setBusy(true);
    setErr(null);
    const r = await addLineAction(invoiceId, p, v.pick).catch(() => ({ ok: false, field: "" }));
    sending.current = false;
    setBusy(false);
    if (!r.ok) return setErr(A.inv.fail[r.field ?? ""] ?? A.error);
    // the line is on the sheet now: this row has done its work
    sent.current = true;
    onClose();
  };

  return (
    <form
      className="inv-row inv-edit inv-new"
      aria-label={A.inv.newLine}
      onSubmit={(e) => {
        e.preventDefault();
        void save(d);
      }}
      onBlur={(e) => {
        // left with a whole line in it: it is saved, as a line that exists is
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void save(d, true);
      }}
    >
      <span className="inv-c-no" />
      <label className="inv-c-text">
        <span>{A.inv.lineName}</span>
        <NamePicker
          value={d.text}
          label={A.inv.text}
          autoFocus={count > 0}
          onType={(text) => setD({ ...d, text, pick: null })}
          onPick={(it) => {
            const next = { ...d, text: it.name, unit: amountText(it.priceCents), pick: pickOf(it) };
            setD(next);
            void save(next);
          }}
        />
      </label>
      <label className="n">
        <span>{A.inv.unitLong}</span>
        <input inputMode="decimal" aria-label={A.inv.unit} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
      </label>
      <label className="n">
        <span>{A.inv.qty}</span>
        <input inputMode="numeric" aria-label={A.inv.qty} value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
      </label>
      <span className="c" />
      <label className="n">
        <span>{A.inv.discount}</span>
        <input inputMode="decimal" aria-label={A.inv.discount} value={d.discount} onChange={(e) => setD({ ...d, discount: e.target.value })} />
      </label>
      <b className="n inv-c-sum">{parsedLine(d) ? amountText(parsedLine(d)!.qty * parsedLine(d)!.unitCents - parsedLine(d)!.discountCents) : ""}</b>
      <button type="button" className="iv-ibtn inv-c-x" aria-label={A.inv.cancelLine} title={A.inv.cancelLine} disabled={busy} onClick={onClose}>
        <XIcon size={18} />
      </button>
      <div className="inv-c-err inv-new-acts">
        {err && (
          <p className="iv-err" role="alert">
            {err}
          </p>
        )}
        <button type="submit" className="iv-btn is-sm is-main" disabled={busy}>
          {A.inv.saveLine}
        </button>
      </div>
    </form>
  );
}

/* ---------- «Заметка к счёту»: internal, as Isolta's «Заметка (не будет видна на инвойсе)» ---------- */

function NoteDialog({ invoiceId, note, onClose }: { invoiceId: string; note: string; onClose: () => void }) {
  const A = useA();
  const [v, setV] = useState(note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const ok = await setNoteAction(invoiceId, v).catch(() => false);
    setBusy(false);
    if (ok) onClose();
    else setErr(A.error);
  };
  return (
    <Dialog
      title={A.inv.noteTitle}
      onClose={() => !busy && onClose()}
      foot={
        <>
          <span className="iv-mute" style={{ marginRight: "auto", alignSelf: "center" }}>
            {A.inv.noteCount(v.length, NOTE_MAX)}
          </span>
          <button type="button" className="iv-btn is-main" disabled={busy || v === note} onClick={() => void save()}>
            {A.save}
          </button>
        </>
      }
    >
      <Field label={A.inv.noteLabel}>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <textarea rows={8} maxLength={NOTE_MAX} autoFocus value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      {err && (
        <p className="iv-err" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}

/* ---------- «Посмотреть и отправить счёт» ---------- */

/**
 * The draft's PDF as it would print now (no number, the draft stamp), with
 * the two ways on: back to the draft, or «Выставить и отправить», which is
 * the moment the number is given. A browser that shows a PDF in the page
 * shows it here; a phone gets it by the link, in its own viewer.
 */
function PreviewDialog({ inv, onClose }: { inv: ViewInvoice; onClose: () => void }) {
  const A = useA();
  const frame = useFrame();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // refused for want of the company's IBAN or address: said with the way to «Настройки»
  const [blocked, setBlocked] = useState<string | null>(null);
  const [inline, setInline] = useState(false);
  const src = `${INV_ROOT}/${inv.id}/preview`;
  useEffect(() => {
    setInline((navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === true);
  }, []);

  const issue = async () => {
    setBusy(true);
    setErr(null);
    setBlocked(null);
    try {
      const r = await issueAction(inv.id);
      if (!r.ok) {
        setBusy(false);
        if (A.inv.blocked[r.code]) return setBlocked(r.code);
        return setErr(A.inv.fail[r.code] ?? A.error);
      }
      frame.say(A.inv.issued(r.number));
      onClose();
    } catch {
      setBusy(false);
      setErr(A.error);
    }
  };

  return (
    <Dialog
      title={A.inv.previewTitle}
      head={<StatusTag A={A} status="draft" />}
      wide
      onClose={() => !busy && onClose()}
      foot={
        <>
          <button type="button" className="iv-btn" disabled={busy} onClick={onClose}>
            {A.inv.backToDraft}
          </button>
          <button type="button" className="iv-btn is-main" disabled={busy} onClick={() => void issue()}>
            {A.inv.issueSend}
          </button>
        </>
      }
    >
      <p className="iv-note">{A.inv.previewHint(inv.receiver.email || "—")}</p>
      {inline && <iframe className="inv-preview" title={A.inv.previewFrame} src={`${src}#toolbar=0&view=FitH`} />}
      <p>
        <a className={inline ? "iv-txt" : "iv-btn"} href={src} target="_blank" rel="noopener">
          <ToolIcon name="eye" />
          {A.inv.previewOpen}
        </a>
      </p>
      {err && (
        <p className="iv-err" role="alert">
          {err}
        </p>
      )}
      {blocked && <Blocked code={blocked} alert />}
    </Dialog>
  );
}
