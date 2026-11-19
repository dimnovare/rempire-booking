"use client";

/**
 * «Уведомления»: what this client lets us send him
 * (src/lib/client-notify.ts).
 *
 *   - «Рекламные сообщения: не отправлять»: kept for the day we send
 *     advertising; the tab «Отправить сообщение» shows it as a reminder;
 *   - the channels he accepts: SMS, e-mail, push;
 *   - a switch per kind of message we send a client by ourselves: the
 *     booking's confirmation, the reminder, and the letters when the salon
 *     moves or cancels his visit. No other kind is listed, because no
 *     other is sent.
 *
 * The outbox queues nothing for him by a channel or of a kind that is off
 * here. Saved by the yellow «Сохранить», like the card.
 */
import { useCallback, useRef, useState } from "react";
import { CLIENT_KINDS } from "@/lib/client-notify";
import { useA } from "../../../lang";
import { saveNotifyAction } from "../actions";
import type { NotifyFields } from "../card-fields";
import { Switch, Tick, useCard, useForgetOnLeave, useGuard } from "./parts";

export function NotifyTab({ initial }: { initial: NotifyFields }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const [base, setBase] = useState(initial);
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const baseRef = useRef(base);
  baseRef.current = base;
  const reset = useCallback(() => {
    setD(baseRef.current);
    setMsg(null);
  }, []);
  const changed = JSON.stringify(d) !== JSON.stringify(base);
  useGuard("notify", changed, reset);
  useForgetOnLeave(() => setMsg(null));

  const set = (patch: Partial<NotifyFields>) => {
    setD((cur) => ({ ...cur, ...patch }));
    setMsg(null);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const sent = d;
    try {
      const r = await saveNotifyAction(card.id, sent);
      if (r.ok) setBase(sent);
      setMsg(r.ok ? { ok: true, text: A.saved } : { ok: false, text: A.visit.invalid(r.field) });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };

  return (
    <>
      <div className="cc-scroll">
        <div className="cc-notify">
          <h2 className="cc-h1">{K.notifyTitle}</h2>
          <fieldset className="cc-group">
            <legend>{K.ads}</legend>
            <Tick checked={d.adsOff} onChange={(adsOff) => set({ adsOff })}>
              {K.adsNo}
            </Tick>
          </fieldset>
          <fieldset className="cc-group">
            <legend>{K.chTitle}</legend>
            <Tick checked={d.sms} onChange={(sms) => set({ sms })}>
              {K.channels.sms}
            </Tick>
            <Tick checked={d.email} onChange={(email) => set({ email })}>
              {K.channels.email}
            </Tick>
            <Tick checked={d.push} onChange={(push) => set({ push })}>
              {K.channels.push}
            </Tick>
          </fieldset>
          <fieldset className="cc-group">
            <legend>{K.kindsTitle}</legend>
            {CLIENT_KINDS.map((k) => (
              <Switch key={k} checked={d.kinds[k]} onChange={(v) => set({ kinds: { ...d.kinds, [k]: v } })}>
                {K.switches[k]}
              </Switch>
            ))}
          </fieldset>
        </div>
      </div>
      <footer className="cc-foot">
        <span />
        <div className="cc-foot-end">
          {msg && !(msg.ok && changed) ? (
            <p className={msg.ok ? "cc-saved" : "adm-err"} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </p>
          ) : (
            <p className="cc-saved" role="status" />
          )}
          <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void save()}>
            {A.save}
          </button>
        </div>
      </footer>
    </>
  );
}
