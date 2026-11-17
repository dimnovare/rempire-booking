"use client";

import { useState } from "react";
import { useA } from "../../lang";
import { makeDraftsAction, retrySaleAction } from "./actions";

/** «Сделать черновики»: one per receiver with something to bill; one that exists is left as it is. */
export function MakeDrafts({ month, hint }: { month: string; hint: string }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await makeDraftsAction(month);
      const text = [A.inv.madeDrafts(r.made), ...r.problems.map(A.inv.problem)].join(" ");
      setMsg({ ok: r.problems.length === 0, text });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };
  return (
    <div className="adm-inv-drafts">
      <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={busy} onClick={() => void go()}>
        {A.inv.makeDrafts}
      </button>
      {msg ? (
        <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">
          {msg.text}
        </p>
      ) : (
        <p className="adm-meta">{hint}</p>
      )}
    </div>
  );
}

type Failed = { id: string; staffName: string; name: string; qty: number; total: string; at: string; error: string };

/** Sales the shop said no to: recorded here, the stock there did not go down. */
export function FailedSales({ rows }: { rows: Failed[] }) {
  const A = useA();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const retry = async (id: string) => {
    setBusy(id);
    try {
      if (await retrySaleAction(id)) setGone((g) => [...g, id]);
    } catch {
      /* stays in the list */
    }
    setBusy(null);
  };
  const left = rows.filter((r) => !gone.includes(r.id));
  if (!left.length) return null;
  return (
    <div className="adm-card">
      <h2 className="adm-card-h">{A.inv.failed}</h2>
      <p className="adm-meta">{A.inv.failedHint}</p>
      <ul className="adm-list">
        {left.map((r) => (
          <li key={r.id} className="adm-inv-failed">
            <span className="txt">
              <span className="plain">
                {r.name} × {r.qty}
              </span>
              <small>
                {r.staffName} · {r.at} · {r.total}
                {r.error ? ` · ${r.error}` : ""}
              </small>
            </span>
            <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={busy === r.id} onClick={() => void retry(r.id)}>
              {A.inv.retry}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
