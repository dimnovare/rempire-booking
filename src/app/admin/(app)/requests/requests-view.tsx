"use client";

import { useEffect, useState } from "react";
import type { RequestRow } from "@/lib/barber/requests";
import { requestWords } from "@/lib/barber/request-words";
import type { SelfKey, SelfMode } from "@/lib/settings";
import { useA } from "../../lang";
import { SaveState, useAutoSave } from "../autosave";
import { answer, setSelf } from "./actions";

type Toast = { text: string; bad?: boolean };

function useWhen(tz: string) {
  const A = useA();
  const f = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (ms: number) => f.format(new Date(ms));
}

export function RequestsView({ open, recent, owner, modes, tz }: { open: RequestRow[]; recent: RequestRow[]; owner: boolean; modes: Record<SelfKey, SelfMode>; tz: string }) {
  const A = useA();
  const R = A.req;
  const when = useWhen(tz);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="adm-cards">
      {owner && <Switches modes={modes} />}

      <section className="adm-card">
        <h2 className="adm-card-h">
          {R.open}
          {open.length > 0 && <span className="adm-tag warn adm-req-n">{open.length}</span>}
        </h2>
        {open.length === 0 ? (
          <p className="adm-meta">{R.none}</p>
        ) : (
          <ul className="adm-list adm-req">
            {open.map((r) => (
              <OpenRow key={r.id} r={r} tz={tz} when={when(r.createdAt)} onToast={setToast} />
            ))}
          </ul>
        )}
      </section>

      <section className="adm-card">
        <h2 className="adm-card-h">{R.recent}</h2>
        {recent.length === 0 ? (
          <p className="adm-meta">{R.noneRecent}</p>
        ) : (
          <ul className="adm-list adm-req">
            {recent.map((r) => (
              <li key={r.id}>
                <div className="adm-req-row">
                  <b>{r.staffName}</b>
                  <span className="plain">{requestWords(r.what, tz, A.lang)}</span>
                  {r.note && <small>{R.his(r.note)}</small>}
                  <span className="tags">
                    <span className={`adm-tag${r.status === "declined" ? " warn" : r.status === "approved" ? " lime" : ""}`}>{R.status[r.status]}</span>
                    <small>{when(r.decidedAt ?? r.createdAt)}</small>
                  </span>
                  {r.answerNote && <small>{R.his(r.answerNote)}</small>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <p className={`adm-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </div>
  );
}

function OpenRow({ r, tz, when, onToast }: { r: RequestRow; tz: string; when: string; onToast: (t: Toast) => void }) {
  const A = useA();
  const R = A.req;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (verdict: "approved" | "declined") => {
    setBusy(true);
    try {
      const res = await answer(r.id, verdict, note);
      if (res.ok) onToast({ text: verdict === "approved" ? R.approved : R.declined });
      else onToast({ text: res.code === "done" || res.code === "gone" ? R.gone : A.error, bad: true });
    } catch {
      onToast({ text: A.error, bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      <div className="adm-req-row">
        <b>{r.staffName}</b>
        <span className="plain">{requestWords(r.what, tz, A.lang)}</span>
        {r.note && <small>{R.his(r.note)}</small>}
        <span className="tags">
          {r.visitsInside > 0 && <span className="adm-tag warn">{R.inside(r.visitsInside)}</span>}
          <small>{when}</small>
        </span>
        <label className="adm-field">
          <span>{R.note}</span>
          <input value={note} maxLength={300} placeholder={R.notePh} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="adm-btns">
          <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void go("approved")}>
            {R.approve}
          </button>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" disabled={busy} onClick={() => void go("declined")}>
            {R.decline}
          </button>
        </div>
      </div>
    </li>
  );
}

/** Owner only: the two switches save by themselves, like the admin's other settings. */
function Switches({ modes }: { modes: Record<SelfKey, SelfMode> }) {
  const A = useA();
  const R = A.req;
  const [now, setNow] = useState(modes);
  const auto = useAutoSave(now, setNow, async (v) => (await setSelf("barber_self_time", v.barber_self_time)) && (await setSelf("barber_self_price", v.barber_self_price)), {
    label: R.switches,
  });
  const row = (key: SelfKey, label: string) => (
    <div className="adm-field">
      <span>{label}</span>
      <div className="adm-seg adm-seg-wide" role="group" aria-label={label}>
        {(["now", "ask"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={now[key] === v} onClick={() => setNow({ ...now, [key]: v })}>
            {R[v]}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section className="adm-card">
      <h2 className="adm-card-h">{R.switches}</h2>
      {row("barber_self_time", R.time)}
      {row("barber_self_price", R.price)}
      <p className="adm-meta">{R.switchHint}</p>
      <SaveState auto={auto} />
    </section>
  );
}
