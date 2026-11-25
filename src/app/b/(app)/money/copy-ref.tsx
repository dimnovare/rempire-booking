"use client";

/**
 * «Скопировать» beside an invoice's reference number: the digits only, for
 * the bank's «viitenumber» field, and «Скопировано» for a moment after.
 */
import { useEffect, useState } from "react";
import { useB } from "../../lang";
import { Ic } from "../sell/icons";

export function CopyRef({ value }: { value: string }) {
  const M = useB().money;
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 2000);
    return () => window.clearTimeout(t);
  }, [done]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
    } catch {
      // no clipboard (an old browser, or not allowed): the number is on the screen to type
    }
  };
  return (
    <button type="button" className={`adm-btn adm-btn-line${done ? " is-done" : ""}`} onClick={() => void copy()}>
      <Ic name={done ? "check" : "copy"} size={16} />
      <span aria-live="polite">{done ? M.copied : M.copy}</span>
    </button>
  );
}
