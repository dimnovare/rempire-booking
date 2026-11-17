"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function Confirm({ yes }: { yes: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-warn" disabled={pending}>
      {yes}
    </button>
  );
}

/** Two taps: «Cancel the visit», then «Yes, cancel». */
export function CancelButton({ action, label, sure, yes, keep }: { action: () => Promise<void>; label: string; sure: string; yes: string; keep: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="taken">
      <h3>{sure}</h3>
      <Confirm yes={yes} />
      <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>
        {keep}
      </button>
    </form>
  );
}
