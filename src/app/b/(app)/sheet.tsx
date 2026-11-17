"use client";

/**
 * The barber app's sheet: from the bottom, as the admin's on a phone (the
 * same classes from admin.css), with the barber app's words.
 */
import { useEffect } from "react";
import { XIcon } from "../../admin/icons";
import { useB } from "../lang";

export function BSheet({ title, onClose, bar, children }: { title: string; onClose: () => void; bar?: React.ReactNode; children: React.ReactNode }) {
  const B = useB();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    // the page under the sheet stays put
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      html.style.overflow = before;
    };
  }, [onClose]);
  return (
    <div className="adm-sheet-wrap bx-sheet-wrap" onClick={onClose}>
      <div className="adm-sheet bx-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="adm-grab" aria-hidden="true" />
        <div className="adm-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="adm-ibtn" aria-label={B.close} onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="adm-sheet-body">{children}</div>
        {bar && <div className="adm-bar">{bar}</div>}
      </div>
    </div>
  );
}
