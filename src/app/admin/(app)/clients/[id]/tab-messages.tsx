"use client";

/**
 * «Сообщения» and «Отправить сообщение».
 *
 * «Сообщения»: every message to this client in the outbox, by its time:
 * the ones about his visits (a confirmation, a reminder, «moved»,
 * «cancelled») and the ones written by hand, each with when, what kind,
 * its state and its channel.
 *
 * «Отправить сообщение»: a text, the channels as ticks, the yellow
 * «Отправить». The message is queued, a row per channel, and the cron
 * sends it within a few minutes. Only the channels he can be reached by
 * and accepts can be ticked (his «Уведомления»); a notification is offered
 * only while he has one turned on for a visit ahead. While SMS has no
 * provider, an SMS waits in the queue, and the tab says so.
 */
import { useId, useState } from "react";
import type { ClientMessage, ClientReach } from "@/lib/admin/client-card";
import type { ClientChannel } from "@/lib/client-notify";
import { smsSegments } from "@/lib/sms";
import { useA } from "../../../lang";
import { sendMessageAction } from "../actions";
import { Tick, useCard, useFmt, useForgetOnLeave } from "./parts";

export function MessagesTab({ messages }: { messages: ClientMessage[] }) {
  const A = useA();
  const K = A.clients.card;
  const fmt = useFmt(useCard().tz);
  return (
    <div className="cc-scroll">
      {messages.length === 0 ? (
        <p className="cc-meta">{K.msgNone}</p>
      ) : (
        <table className="cc-table cc-msgs">
          <thead>
            <tr>
              <th scope="col">{K.msgCols.text}</th>
              <th scope="col">{K.msgCols.at}</th>
              <th scope="col">{K.msgCols.kind}</th>
              <th scope="col">{K.msgCols.status}</th>
              <th scope="col">{K.msgCols.channel}</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td className="txt">{m.text ?? (m.visitAt == null ? (K.kinds[m.kind] ?? m.kind) : K.about(fmt.moment(m.visitAt)))}</td>
                <td className="at">{fmt.moment(m.at)}</td>
                <td className="kind">{K.kinds[m.kind] ?? m.kind}</td>
                <td className={`st st-${m.status}`}>{K.statuses[m.status] ?? m.status}</td>
                <td className="ch">
                  <span className="cc-tag">{K.channels[m.channel] ?? m.channel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const CHANNELS: readonly ClientChannel[] = ["sms", "email", "push"];

export function SendTab({ reach, smsReady, adsOff, max }: { reach: ClientReach; smsReady: boolean; adsOff: boolean; max: number }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const field = useId();
  const [text, setText] = useState("");
  const [on, setOn] = useState<Record<ClientChannel, boolean>>({ sms: false, email: false, push: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useForgetOnLeave(() => setMsg(null));
  // a notification is offered only while he has one on; the other two always, ticked or greyed
  const shown = CHANNELS.filter((c) => c !== "push" || reach.push !== "none");
  const picked = shown.filter((c) => on[c] && reach[c] === "ok");
  const sms = smsSegments(text);

  const send = async () => {
    if (busy) return;
    if (!text.trim()) return setMsg({ ok: false, text: K.msgNeedText });
    if (!picked.length) return setMsg({ ok: false, text: K.msgNeedChannel });
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendMessageAction(card.id, { text, channels: picked });
      if (r.ok) {
        setText("");
        setMsg({ ok: true, text: K.msgQueued });
      } else setMsg({ ok: false, text: r.code === "refused" ? K.msgRefused(K.channels[r.channel]) : r.code === "text" ? K.msgNeedText : r.code === "channels" ? K.msgNeedChannel : A.error });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };

  return (
    <div className="cc-scroll">
      <form
        className="cc-send"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="cc-field">
          <label htmlFor={field}>{K.msgText}</label>
          <textarea
            id={field}
            rows={6}
            maxLength={max}
            aria-describedby={`${field}-count`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMsg(null);
            }}
          />
          <small id={`${field}-count`} aria-live="polite">
            {K.msgCount(text.length, text ? sms.segments : 0)}
          </small>
        </div>
        <fieldset className="cc-group">
          <legend>{K.msgChannels}</legend>
          {shown.map((c) => (
            <Tick
              key={c}
              checked={on[c] && reach[c] === "ok"}
              disabled={reach[c] !== "ok"}
              note={reach[c] === "none" ? K.noWay[c] : reach[c] === "off" ? K.wayOff : c === "sms" && !smsReady ? K.smsWaits : undefined}
              onChange={(v) => {
                setOn((cur) => ({ ...cur, [c]: v }));
                setMsg(null);
              }}
            >
              {K.channels[c]}
            </Tick>
          ))}
        </fieldset>
        {adsOff && <p className="cc-note">{K.adsOff}</p>}
        <div className="cc-send-end">
          <button type="submit" className="cc-btn cc-btn-main" disabled={busy}>
            {K.sendBtn}
          </button>
          {msg && (
            <p className={msg.ok ? "cc-saved" : "adm-err"} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
