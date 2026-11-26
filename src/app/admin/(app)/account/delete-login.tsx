"use client";

/**
 * «Удалить вход» (Dim, 25.11.2026, design artifact 53PfD3DxCRkbDyjwLVvBHB,
 * boards «Доступ: удалить вход» and «Доступ, телефон: действия»).
 *
 * The question before a login is deleted says who exactly (name, e-mail,
 * role), what goes (the login and its rights) and what stays (visits,
 * sales, invoices and the change history keep the name). A login that is
 * still on is offered the softer way, «Отключите вход», which keeps its
 * rights. After it, the toast has «Вернуть» (access.tsx).
 *
 * On a phone a row's «⋯» opens a sheet from the bottom with the same
 * actions as the wide menu: «Права доступа», «Отключить вход», then
 * «Удалить вход» apart and in red. Between the first two, «Он же барбер»
 * (26.11.2026, design «Доступ, телефон: он же барбер»): the wide row's
 * select, moved off the phone's card. It opens a list of «Нет» and the
 * barbers in the sheet; a pick saves at once.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretIcon, InfoIcon, NextIcon } from "../../icons";
import { useA } from "../../lang";
import { Sheet } from "../sheet";
import type { AccessRow } from "./access";

/** null: done; a string: what went wrong, shown in the question. */
type Job = () => Promise<string | null>;

export function DeleteAsk({ row, onClose, onYes, onOff }: { row: AccessRow; onClose: () => void; onYes: Job; onOff: Job }) {
  const A = useA();
  const T = A.account;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const run = async (job: Job) => {
    setBusy(true);
    setErr(null);
    try {
      const e = await job();
      if (e) setErr(e);
      else onClose();
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };
  const name = row.name || row.email.split("@")[0];
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask ac-del" role="alertdialog" aria-modal="true" aria-labelledby="ac-del-t" aria-describedby="ac-del-d" onClick={(e) => e.stopPropagation()}>
        <h2 id="ac-del-t">{T.delAsk}</h2>
        <div className="ac-del-who">
          <span className="ac-av" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <b>{name}</b>
            <small>
              {row.email} · {row.roleName}
            </small>
          </span>
        </div>
        <p id="ac-del-d">{T.delText}</p>
        <p>{T.delKeeps}</p>
        {row.active && (
          <p className="ac-del-soft">
            <InfoIcon size={16} />
            <span>
              {T.delSoft[0]}{" "}
              <button type="button" className="ac-lnk" disabled={busy} onClick={() => void run(onOff)}>
                {T.delSoft[1]}
              </button>
              {T.delSoft[2]}
            </span>
          </p>
        )}
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
        <div className="cc-ask-btns">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={onClose}>
            {A.cancel}
          </button>
          <button type="button" className="cc-btn cc-btn-red" disabled={busy} onClick={() => void run(onYes)}>
            {T.delYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A phone's sheet of one row's actions. `mayRights`: the rights page;
 * `mayFlip`: switching off or on. `blocked`: why this login may not be
 * switched off or deleted (one's own; an owner's, for an admin), shown
 * under a greyed «Удалить вход». `barber`: the barber the login is now;
 * `linkWhy`: why that cannot be changed here, shown under a greyed
 * «Он же барбер»; `onLink` saves a pick ("" for «Нет»).
 */
export function RowSheet({
  row,
  blocked,
  mayRights,
  mayFlip,
  mayDelete,
  barber,
  linkWhy,
  linking,
  onLink,
  onClose,
  onFlip,
  onDelete,
}: {
  row: AccessRow;
  blocked: string | null;
  mayRights: boolean;
  mayFlip: boolean;
  /** the right to delete at all («Удалять пользователей»): without it the item is not there */
  mayDelete: boolean;
  barber: { id: string; name: string | null };
  linkWhy: string | null;
  /** a pick is being saved */
  linking: boolean;
  onLink: (staffId: string) => void;
  onClose: () => void;
  onFlip: () => void;
  onDelete: () => void;
}) {
  const A = useA();
  const T = A.account;
  const [open, setOpen] = useState(false);
  const head = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // opened: the focus on the barber it is now (or «Нет»), so the next tap or arrow starts there
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);
  const pick = (id: string) => {
    if (id !== barber.id) onLink(id);
    setOpen(false);
    head.current?.focus();
  };
  // ↑ ↓ move between the list's rows, as in any menu
  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  const choices = [{ id: "", name: T.notBarber }, ...row.linkable];
  return (
    <Sheet title={row.name || row.email.split("@")[0]} onClose={onClose}>
      <p className="ac-sheet-mail">{row.email}</p>
      <div role="menu" aria-label={T.actsOf(row.email)} className="ac-sheet-menu">
        {mayRights && (
          <Link role="menuitem" className="ac-sheet-item" href={`/admin/account/${row.id}`} prefetch={false} onClick={onClose}>
            <span>{A.rights.title}</span>
            <NextIcon size={18} />
          </Link>
        )}
        {/* while a pick saves, the row keeps the focus (a disabled button would drop it); it only does not open */}
        <button
          ref={head}
          type="button"
          role="menuitem"
          className="ac-sheet-item ac-sheet-also"
          aria-expanded={linkWhy ? undefined : open}
          aria-controls={open ? `ac-also-${row.id}` : undefined}
          aria-describedby={linkWhy ? `ac-also-w-${row.id}` : undefined}
          aria-busy={linking || undefined}
          disabled={!!linkWhy}
          onClick={() => !linking && setOpen(!open)}
        >
          <span>{T.alsoBarber}</span>
          <span className="ac-sheet-val">
            <span className="sr">: </span>
            {barber.name ?? T.notBarber}
          </span>
          {!linkWhy && <CaretIcon size={18} />}
        </button>
        {linkWhy && (
          <small className="ac-own" id={`ac-also-w-${row.id}`}>
            {linkWhy}
          </small>
        )}
        {open && !linkWhy && (
          <div role="group" aria-label={T.alsoBarber} id={`ac-also-${row.id}`} className="ac-pick" ref={list} onKeyDown={arrows}>
            {choices.map((s) => (
              <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === barber.id} className="ac-pick-item" onClick={() => pick(s.id)}>
                <span>{s.name}</span>
                <i className="ac-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {mayFlip && (
          <button type="button" role="menuitem" className="ac-sheet-item" onClick={onFlip}>
            <span>{row.active ? T.offYes : T.enable}</span>
          </button>
        )}
        {mayDelete && (
          <>
            <div role="separator" className="ac-sheet-sep" />
            <button type="button" role="menuitem" className="ac-sheet-item is-red" disabled={!!blocked} aria-describedby={blocked ? `ac-own-${row.id}` : undefined} onClick={onDelete}>
              <span>{T.delYes}</span>
            </button>
            {blocked && (
              <small className="ac-own" id={`ac-own-${row.id}`}>
                {blocked}
              </small>
            )}
          </>
        )}
      </div>
      <button type="button" className="adm-btn adm-btn-line ac-sheet-cancel" onClick={onClose}>
        {A.cancel}
      </button>
    </Sheet>
  );
}
