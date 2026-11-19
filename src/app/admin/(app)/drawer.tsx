"use client";

/**
 * A drawer from the right, in the look of the visit window we follow
 * (docs/reference-looks.md): a pale ground, white columns with 8px corners,
 * and a white foot with the title on the left and the buttons on the right,
 * the yellow one last. On a phone it fills the screen and its columns stand
 * one under another.
 *
 * Escape, the dark side and «Закрыть» close it.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { useA } from "../lang";

export function Drawer({ title, size = "wide", onClose, foot, children }: { title: string; size?: "wide" | "narrow"; onClose: () => void; foot?: React.ReactNode; children: React.ReactNode }) {
  const A = useA();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // the keyboard starts inside it. Before the first paint: a moment later it would take the focus
  // from a field that is already being typed into, and the typing would be lost
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus();
  }, []);
  return (
    <div className="dw-wrap" onClick={onClose}>
      <div ref={box} className={`dw dw-${size}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="dw-body">{children}</div>
        <footer className="dw-foot">
          <h2>{title}</h2>
          <div className="dw-acts">
            <button type="button" className="dw-btn" onClick={onClose}>
              {A.close}
            </button>
            {foot}
          </div>
        </footer>
      </div>
    </div>
  );
}
