"use client";

import { useState } from "react";
import { reportDoneAction } from "@/components/test-banner-actions";
import { useA } from "../../lang";

/** «Готово» on a report, or «Вернуть» on one already ticked off. */
export function DoneButton({ id, done }: { id: string; done: boolean }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="adm-btn adm-btn-ghost adm-btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await reportDoneAction(id, !done);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? A.test.reopen : A.test.done}
    </button>
  );
}
