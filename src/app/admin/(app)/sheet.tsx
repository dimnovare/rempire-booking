"use client";

/**
 * One sheet for the whole admin: from the bottom on a phone, a panel on the
 * right from 900px (the page stays in view and clickable beside it).
 * The body scrolls; the bar under it holds the total and the main button,
 * so «Записать» or «Сохранить» is always in reach.
 */
import { useEffect } from "react";
import { A } from "../copy";
import { XIcon } from "../icons";

export function Sheet({ title, onClose, bar, children, alert }: { title: string; onClose: () => void; bar?: React.ReactNode; children: React.ReactNode; alert?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="adm-sheet-wrap" onClick={onClose}>
      <div className={`adm-sheet${alert ? " adm-ask" : ""}`} role={alert ? "alertdialog" : "dialog"} aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="adm-grab" aria-hidden="true" />
        <div className="adm-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="adm-ibtn" aria-label={A.close} onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="adm-sheet-body">{children}</div>
        {bar && <div className="adm-bar">{bar}</div>}
      </div>
    </div>
  );
}

/**
 * A part of a page with its own form. On a phone it is a sheet that shows
 * while `open`; from 900px it is a card that is always open in the page, so
 * a wide screen shows every part at once and nothing moves on a click.
 * Its content stays mounted either way: what was typed is kept.
 */
export function Pane({ title, open, onClose, bar, children }: { title: string; open: boolean; onClose: () => void; bar?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <div className={`adm-sheet-wrap adm-pane-wrap${open ? " is-open" : ""}`} onClick={onClose}>
      <section className="adm-sheet adm-pane" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="adm-grab" aria-hidden="true" />
        <div className="adm-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="adm-ibtn" aria-label={A.close} onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="adm-sheet-body">{children}</div>
        {bar && <div className="adm-bar">{bar}</div>}
      </section>
    </div>
  );
}
