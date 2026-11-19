"use client";

/**
 * A 32px control with what it opens beside it: a menu of choices, or a
 * small dialog. A click outside or Escape closes it. The journal's bar
 * (journal-bar.tsx) and the client base (clients/) open theirs with it; its
 * look is the «jr-» block of admin.css, from 900px.
 */
import { useEffect, useRef, useState } from "react";

export function Pop({
  kind,
  name,
  label,
  button,
  icon,
  pressed,
  marked,
  place,
  className,
  title,
  children,
}: {
  kind: "menu" | "dialog";
  /** what opens, by name */
  name: string;
  /** the button's own name, when its words do not say it (an icon, a sum) */
  label?: string;
  button: React.ReactNode;
  /** a square icon button */
  icon?: boolean;
  /** one half of «День | Неделя»: dark while it is the open view */
  pressed?: boolean;
  /** a dot on the icon: the control is set to something other than «everything» */
  marked?: boolean;
  /** where it opens: under the button from its right edge (the default), from its left edge, or above it */
  place?: "left" | "up";
  /** more classes for the button */
  className?: string;
  title?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="jr-pop-wrap" ref={box}>
      <button
        type="button"
        className={`jr-btn${icon ? " jr-ibtn" : ""}${marked ? " is-marked" : ""}${className ? ` ${className}` : ""}`}
        aria-label={label}
        title={title}
        aria-haspopup={kind}
        aria-expanded={open}
        aria-pressed={pressed}
        onClick={() => setOpen(!open)}
      >
        {button}
      </button>
      {open && (
        <div className={`jr-pop jr-pop-${kind}${place ? ` jr-pop-${place}` : ""}`} role={kind} aria-label={name}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
