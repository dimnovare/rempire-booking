"use client";

import { useState } from "react";

/** A form behind one line on a phone (a tap opens it); from 900px, where there is room, it is open under its heading. */
export function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`adm-fold2${open ? " is-open" : ""}`}>
      <button type="button" className="adm-fold2-btn only-narrow" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
      </button>
      <h3 className="adm-fold2-h only-wide">{title}</h3>
      <div className="adm-fold2-body">{children}</div>
    </div>
  );
}
