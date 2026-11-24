"use client";

/**
 * The pieces every «Счета» page is built of, to the measures of the
 * invoicing tool's own frame (docs/isolta-pages.md, «Components»; the
 * «iv-» block of admin.css):
 *
 *   IvTop      the white bar: the title, the page's buttons and, on a phone,
 *              the section's pages as a row of chips. The list, the section's
 *              entry, keeps the star that puts «Счета» among the salon's
 *              «Избранное» (star.tsx), or the login could not take it off;
 *   Dialog     a centred window with a head, a body and a foot;
 *   Confirm    the same as a question that must be answered («alertdialog»);
 *   Blocked    why an invoice cannot go out yet, with the way to «Настройки»;
 *   MenuButton a button with a menu under it («Инструменты»);
 *   Field      a 56px field with its label cut into the line;
 *   Period     «Период» and the two dates, with ‹ › to step by it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isDay, periodOf, type Gran, GRANS } from "@/lib/billing/list";
import { CaretIcon, NextIcon, PrevIcon, XIcon } from "../../icons";
import { useA } from "../../lang";
import { PageStar } from "../star";
import { INV_PAGES, INV_ROOT, invPageOf } from "./common";

/** The white bar on top of a page. `children` are its buttons; `star` puts the section's star beside the title. */
export function IvTop({ title, sub, star, children }: { title: string; sub?: string; star?: boolean; children?: React.ReactNode }) {
  const A = useA();
  const here = invPageOf(usePathname());
  return (
    <header className="iv-top">
      <div className="iv-title">
        <h1>
          {title}
          {sub && <small>{sub}</small>}
        </h1>
        {star && <PageStar page="invoices" />}
      </div>
      {children && <div className="iv-acts">{children}</div>}
      {/* a phone has no sidebar: the section's pages are here */}
      <nav className="iv-chips" aria-label={A.inv.title}>
        {INV_PAGES.map((p) => (
          <Link key={p.key} href={p.href} prefetch={false} aria-current={here === p.key ? "page" : undefined}>
            {A.inv.menu[p.key]}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function useEscape(onClose: () => void, on = true) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [on]);
}

export function Dialog({
  title,
  onClose,
  foot,
  wide,
  alert,
  head,
  children,
}: {
  title: string;
  onClose: () => void;
  foot?: React.ReactNode;
  wide?: boolean;
  /** a question that cannot be passed by: the reader is told at once */
  alert?: boolean;
  /** beside the title: a status pill */
  head?: React.ReactNode;
  children: React.ReactNode;
}) {
  const A = useA();
  useEscape(onClose);
  return (
    <div className="iv-dlg-wrap" onClick={onClose}>
      <div className={`iv-dlg${wide ? " is-wide" : ""}`} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="iv-dlg-head">
          <h2>
            {title} {head}
          </h2>
          <button type="button" className="iv-ibtn" aria-label={A.close} onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="iv-dlg-body">{children}</div>
        {foot && <div className="iv-dlg-foot">{foot}</div>}
      </div>
    </div>
  );
}

/**
 * A question before something that cannot be taken back. `onYes` returns
 * what went wrong, or nothing: then the question closes. Words are said as
 * an error; an element (<Blocked>, with its link) is shown as it is.
 */
export function Confirm({ title, ask, yes, danger, onYes, onClose, children }: { title: string; ask: string; yes: string; danger?: boolean; onYes: () => Promise<string | React.ReactElement | null | void>; onClose: () => void; children?: React.ReactNode }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | React.ReactElement | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const e = await onYes();
      if (e) setErr(e);
      else onClose();
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };
  return (
    <Dialog
      title={title}
      alert
      onClose={() => !busy && onClose()}
      foot={
        <>
          <button type="button" className="iv-btn" disabled={busy} onClick={onClose}>
            {A.cancel}
          </button>
          <button type="button" className={`iv-btn ${danger ? "is-red" : "is-main"}`} disabled={busy} onClick={() => void go()}>
            {yes}
          </button>
        </>
      }
    >
      <p>{ask}</p>
      {children}
      {typeof err === "string" ? (
        <p className="iv-err" role="alert">
          {err}
        </p>
      ) : (
        err
      )}
    </Dialog>
  );
}

/**
 * Why an invoice or a credit note cannot go out yet, in plain words, with
 * the way to the company's card in «Настройки» (Isolta refuses to send
 * without the bank account and the sender's address; issueBlock in
 * src/lib/billing/invoices.ts). Above a draft's sheet, in its preview if
 * «Выставить и отправить» was refused, and in «Создать кредит-счёт».
 */
export function Blocked({ code, alert = false }: { code: string; alert?: boolean }) {
  const A = useA();
  return (
    <p className="iv-warn" role={alert ? "alert" : undefined}>
      {A.inv.blocked[code] ?? A.error}{" "}
      <Link className="iv-link" href={`${INV_ROOT}/settings`} prefetch={false}>
        {A.inv.toSettings}
      </Link>
    </p>
  );
}

/** A button and the menu it opens. `children` gets `close`; its items carry role="menuitem". */
export function MenuButton({ label, className = "iv-btn", children }: { label: string; className?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEscape(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  return (
    <div className="iv-menu-wrap" ref={box}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <CaretIcon size={12} />
      </button>
      {open && (
        <div className="iv-menu" role="menu" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Field({ label, hint, className, icon, children }: { label: string; hint?: string; className?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className={`iv-field${icon ? " has-ico" : ""}${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      {icon}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export type PeriodValue = { gran: Gran; from: string; to: string };

/**
 * «Период» (month, year, week, day) and the two dates it is stepped by:
 * ‹ › move a whole period back or on; with no dates yet they start at the
 * period that holds today. The dates can also be typed, and × clears them.
 */
export function Period({ value, today, onChange }: { value: PeriodValue; today: string; onChange: (v: PeriodValue) => void }) {
  const A = useA();
  const step = (by: number) => {
    const set = value.from || value.to;
    const p = periodOf(value.gran, value.from || value.to || today, set ? by : 0);
    onChange({ ...value, ...p });
  };
  const day = (k: "from" | "to", v: string) => onChange({ ...value, [k]: v === "" || isDay(v) ? v : value[k] });
  return (
    <>
      <Field label={A.inv.period} className="f-sel">
        <select
          value={value.gran}
          onChange={(e) => {
            const gran = e.target.value as Gran;
            // dates already set follow the new period; an empty range stays empty
            onChange(value.from || value.to ? { gran, ...periodOf(gran, value.from || value.to) } : { ...value, gran });
          }}
        >
          {GRANS.map((g) => (
            <option key={g} value={g}>
              {A.inv.grans[g]}
            </option>
          ))}
        </select>
      </Field>
      <div className="iv-range" role="group" aria-label={`${A.inv.dateFrom} – ${A.inv.dateTo}`}>
        <button type="button" className="iv-ibtn" aria-label={A.inv.periodPrev} onClick={() => step(-1)}>
          <PrevIcon />
        </button>
        <input type="date" aria-label={A.inv.dateFrom} value={value.from} max={value.to || undefined} onChange={(e) => day("from", e.target.value)} />
        <i aria-hidden="true">–</i>
        <input type="date" aria-label={A.inv.dateTo} value={value.to} min={value.from || undefined} onChange={(e) => day("to", e.target.value)} />
        <button type="button" className="iv-ibtn" aria-label={A.inv.periodNext} onClick={() => step(1)}>
          <NextIcon />
        </button>
        <button type="button" className="iv-ibtn" aria-label={A.inv.periodClear} disabled={!value.from && !value.to} onClick={() => onChange({ ...value, from: "", to: "" })}>
          <XIcon size={16} />
        </button>
      </div>
    </>
  );
}

/** Save what a POST answered as a file under its own name; the number of rows it says it holds. */
export async function downloadPost(url: string, body: unknown, fallbackName: string): Promise<number> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return Number(res.headers.get("x-rows")) || 0;
}
