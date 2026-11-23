"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function Confirm({ yes }: { yes: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-danger" disabled={pending}>
      {yes}
    </button>
  );
}

/** Two taps: «Cancel the visit», then «Yes, cancel». */
export function CancelButton({ action, label, sure, yes, keep }: { action: () => Promise<void>; label: string; sure: string; yes: string; keep: string }) {
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  // The question opens below the fold on a phone, under the browser's own
  // bar (real iPhone and Galaxy, 23.11): bring it up, or the first tap
  // seems to do nothing.
  useEffect(() => {
    if (!asking) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [asking]);
  if (!asking) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form ref={box} action={action} className="taken">
      <h3>{sure}</h3>
      <Confirm yes={yes} />
      <button type="button" className="btn btn-primary" onClick={() => setAsking(false)}>
        {keep}
      </button>
    </form>
  );
}
