"use client";

/**
 * A button for something that cannot be taken back («Выставить»,
 * «Кредитовать», «Сторно»): a tap opens a short sheet that says what will
 * happen, and only its own button does it. `onYes` returns what went
 * wrong, or nothing to close the sheet.
 */
import { useState } from "react";
import { useA } from "../../lang";
import { Sheet } from "../sheet";

export function AskButton({
  label,
  ask,
  yes,
  className = "adm-btn adm-btn-ghost",
  disabled,
  onYes,
  children,
}: {
  label: string;
  ask: string;
  yes?: string;
  className?: string;
  disabled?: boolean;
  onYes: () => Promise<string | null | void>;
  children?: React.ReactNode;
}) {
  const A = useA();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const e = await onYes();
      if (e) setErr(e);
      else setOpen(false);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <Sheet
          title={label}
          alert
          onClose={() => !busy && setOpen(false)}
          bar={
            <>
              {err && (
                <p className="adm-err" role="alert">
                  {err}
                </p>
              )}
              <div className="adm-bar-row">
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" disabled={busy} onClick={() => setOpen(false)}>
                  {A.cancel}
                </button>
                <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void go()}>
                  {yes ?? label}
                </button>
              </div>
            </>
          }
        >
          <p>{ask}</p>
          {children}
        </Sheet>
      )}
    </>
  );
}
