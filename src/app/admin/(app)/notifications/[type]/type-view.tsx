"use client";

/**
 * One message's page (board «Notification-Type»). On the left what can be
 * changed: the switch «Включено», a card per channel with when it goes and
 * its own switch, the reminder's «SMS, push or both», the SMS text with
 * its variables and its length; on the right the preview, built from a
 * made-up visit. Nothing is sent until «Сохранить»; the bar at the bottom
 * says what a change does to messages already planned.
 *
 * The SMS is drawn here as it is typed, by the outbox's own functions
 * (src/lib/admin/notification-text.ts); the letter and the push come from
 * the server in each language. The letter's own text («Дополнительная
 * информация в Email», under the e-mail's card, folded as in Altegio) is
 * put into the letter here as it is typed (src/lib/letter-kit.ts).
 */
import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";
import type { Previews, Sample, TypeDetail } from "@/lib/admin/notification-store";
import { checkTemplate, isSmsType, smsCount, smsWords, type SmsVar } from "@/lib/admin/notification-text";
import { typeDef, type NChannel, type Timing, type TypeChange } from "@/lib/admin/notifications";
import { LOCALES, type Locale } from "@/lib/i18n";
import { EXTRA_MARK, extraBlock } from "@/lib/letter-kit";
import { PrevIcon } from "../../../icons";
import { useA } from "../../../lang";
import { saveTypeAction } from "../actions";
import { timingText } from "../words";
import "../notifications.css";

type Draft = {
  on: boolean;
  /** the channels with a switch of their own: a type with more than one, but never the reminder's push (its «SMS, push or both») */
  channels: Partial<Record<NChannel, boolean>>;
  lead: { sms: number; email: number } | null;
  at: string | null;
  delay: number | null;
  mode: string | null;
  /** the salon's own SMS text; null: the standard one */
  sms: string | null;
  /** the letter's own text as typed ("" none); null: the type has no letter */
  email: string | null;
};

const switchable = (d: TypeDetail, ch: NChannel) => d.channels.length > 1 && !(d.key === "reminder" && ch === "push");

function draftOf(d: TypeDetail): Draft {
  return {
    on: d.on,
    channels: Object.fromEntries(d.channels.filter((c) => switchable(d, c.ch)).map((c) => [c.ch, c.on])),
    lead: d.lead ? { sms: d.lead.sms, email: d.lead.email } : null,
    at: d.at?.value ?? null,
    delay: d.delay?.value ?? null,
    mode: d.mode ?? null,
    sms: d.sms?.template ?? null,
    email: d.email ? d.email.text : null,
  };
}

/** What differs from what was saved: only that is sent. */
function changeOf(was: Draft, now: Draft): TypeChange {
  const c: TypeChange = {};
  if (now.on !== was.on) c.on = now.on;
  for (const ch of ["sms", "email", "push"] as const) if (now.channels[ch] !== undefined && now.channels[ch] !== was.channels[ch]) (c.channels ??= {})[ch] = now.channels[ch];
  if (now.lead && was.lead) {
    if (now.lead.sms !== was.lead.sms) (c.lead ??= {}).sms = now.lead.sms;
    if (now.lead.email !== was.lead.email) (c.lead ??= {}).email = now.lead.email;
  }
  if (now.at !== null && now.at !== was.at) c.at = now.at;
  if (now.delay !== null && now.delay !== was.delay) c.delay = now.delay;
  if (now.mode !== null && now.mode !== was.mode) c.mode = now.mode as TypeChange["mode"];
  if (now.sms !== was.sms) c.sms = now.sms;
  if (now.email !== null && now.email.trim() !== (was.email ?? "").trim()) c.email = now.email.trim() || null;
  return c;
}

type State = { k: "idle" } | { k: "saving" } | { k: "saved" } | { k: "bad"; text: string };

export function TypeView({ detail: d, sample, previews }: { detail: TypeDetail; sample: Sample; previews: Previews }) {
  const A = useA();
  const N = A.notif;
  const def = typeDef(d.key);
  const [base, setBase] = useState<Draft>(() => draftOf(d));
  const [draft, setDraft] = useState<Draft>(base);
  const [state, setState] = useState<State>({ k: "idle" });
  const set = (patch: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...patch }));
    setState({ k: "idle" });
  };
  const change = changeOf(base, draft);
  const dirty = Object.keys(change).length > 0;
  const smsType = isSmsType(d.key) ? d.key : null;
  const smsCheck = smsType && draft.sms !== null ? checkTemplate(smsType, draft.sms) : null;
  const smsBad = smsCheck && !smsCheck.ok ? (smsCheck.code === "unknown" ? N.bad.unknown(smsCheck.token ?? "") : N.bad[smsCheck.code]) : null;

  // the SMS as it would go now, with the made-up visit
  const values = { ...sample.values, link: d.key === "reminder" ? sample.visitLink : d.key === "review_request" ? sample.reviewLink : sample.bookLink };
  const words = smsType ? (smsWords(smsType, values, draft.sms) ?? "") : "";

  /** When a channel goes, from what is on the page now (not yet saved). */
  const timingOf = (ch: NChannel): Timing => {
    const now = d.channels.find((c) => c.ch === ch)!.timing;
    if (d.key === "reminder" && draft.lead) return ch === "sms" ? { kind: "lead", min: draft.lead.sms } : ch === "email" ? { kind: "lead", min: draft.lead.email } : now;
    if (draft.at && now.kind === "at") return { kind: "at", time: draft.at };
    if (draft.at && now.kind === "fallback") return { ...now, time: draft.at };
    if (draft.delay !== null && now.kind === "delay") return { kind: "delay", min: draft.delay };
    if (draft.delay !== null && now.kind === "delayFallback") return { ...now, min: draft.delay };
    return now;
  };

  const save = async () => {
    if (!dirty || smsBad || state.k === "saving") return;
    setState({ k: "saving" });
    try {
      const r = await saveTypeAction(d.key, change);
      if (r.ok) {
        setBase(draft);
        setState({ k: "saved" });
      } else {
        const f = r.field;
        const text =
          f === "forbidden"
            ? N.forbidden
            : f.startsWith("sms.unknown.")
              ? N.bad.unknown(f.slice(12))
              : f === "sms.empty"
                ? N.bad.empty
                : f === "sms.long"
                  ? N.bad.long
                  : f === "email.long"
                    ? N.extra.long(d.email?.max ?? 0)
                    : N.notSaved;
        setState({ k: "bad", text });
      }
    } catch {
      setState({ k: "bad", text: N.notSaved });
    }
  };

  const later =
    d.key === "reminder" ? N.later.reminder : change.at !== undefined ? N.later.at : change.delay !== undefined ? (d.key === "review_request" ? N.later.delayReview : N.later.delay) : N.later.default;
  const head = (ch: NChannel) => (ch === "push" ? N.pushTo[d.audience] : N.ch[ch]);
  const sub = (ch: NChannel) => (ch === "sms" ? (draft.sms ? N.chSub.smsOwn : N.chSub.sms) : ch === "email" ? N.chSub.email : d.audience === "client" ? N.chSub.pushClient : N.chSub.pushStaff);

  return (
    <div className="ntf ntf-type">
      <Link className="adm-back ntf-back" href="/admin/notifications" prefetch={false}>
        <PrevIcon />
        {N.back}
      </Link>
      <div className="adm-page-head ntf-head">
        <div className="cb-titles">
          <h1 className="adm-h1">{N.types[d.key]}</h1>
          <p className="cb-crumb only-wide">{`${N.crumb} · ${N.groups[d.audience]}`}</p>
        </div>
        <label className="ntf-on">
          <input type="checkbox" role="switch" className="cc-sw" checked={draft.on} disabled={!d.may} onChange={(e) => set({ on: e.target.checked })} />
          <span>{N.on}</span>
        </label>
      </div>
      <p className="ntf-about">
        {N.about[d.key]}
        {d.loginsOff && <span className="ntf-logins"> {`(${N.loginsOff})`}</span>}
      </p>
      {!d.may && <p className="adm-note">{N.readOnly}</p>}

      <div className={`ntf-split${draft.on ? "" : " is-off"}`}>
        <div className="ntf-left">
          {/* one hour or one delay for the whole type */}
          {(d.at || d.delay) && (
            <section className="adm-card ntf-card">
              <label className="ntf-field">
                <span>{N.when}</span>
                {d.at ? (
                  <select value={draft.at ?? ""} disabled={!d.may} onChange={(e) => set({ at: e.target.value })}>
                    {d.at.options.map((t) => (
                      <option key={t} value={t}>
                        {N.sub.at(t)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={String(draft.delay ?? "")} disabled={!d.may} onChange={(e) => set({ delay: Number(e.target.value) })}>
                    {d.delay!.options.map((m) => (
                      <option key={m} value={m}>
                        {N.sub.after(N.dur(m))}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </section>
          )}

          <div className="ntf-cards">
            {def.channels
              .filter((ch) => !(d.key === "reminder" && ch === "push"))
              .map((ch) => (
                <section key={ch} className={`adm-card ntf-card${switchable(d, ch) && draft.channels[ch] === false ? " is-off" : ""}`} aria-labelledby={`ntf-ch-${ch}`}>
                  <div className="ntf-card-h">
                    <ChannelIcon ch={ch} />
                    <div>
                      <h2 id={`ntf-ch-${ch}`}>{`${head(ch)} — ${timingText(N, timingOf(ch), true)}`}</h2>
                      <p>{sub(ch)}</p>
                    </div>
                    {switchable(d, ch) && (
                      <input
                        type="checkbox"
                        role="switch"
                        className="cc-sw"
                        aria-label={`${N.send}: ${N.ch[ch]}`}
                        checked={draft.channels[ch] !== false}
                        disabled={!d.rights[ch]}
                        onChange={(e) => set({ channels: { ...draft.channels, [ch]: e.target.checked } })}
                      />
                    )}
                  </div>
                  {d.key === "reminder" && draft.lead && d.lead && ch !== "push" && (
                    <label className="ntf-field">
                      <span>{N.when}</span>
                      <select
                        value={String(ch === "sms" ? draft.lead.sms : draft.lead.email)}
                        disabled={!d.rights[ch]}
                        onChange={(e) => set({ lead: { ...draft.lead!, [ch]: Number(e.target.value) } })}
                      >
                        {(ch === "sms" ? d.lead.options : d.lead.emailOptions).map((m) => (
                          <option key={m} value={m}>
                            {N.lead(N.dur(m))}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {ch === "email" && d.email && draft.email !== null && <EmailExtra text={draft.email} max={d.email.max} may={d.rights.email} set={(email) => set({ email })} />}
                </section>
              ))}
          </div>

          {d.key === "reminder" && draft.mode && (
            <section className="adm-card ntf-card ntf-mode" aria-labelledby="ntf-mode">
              <div className="ntf-card-h">
                <ChannelIcon ch="push" />
                <div>
                  <h2 id="ntf-mode">{N.pushTo.client}</h2>
                  <p>{N.modeHint[draft.mode]}</p>
                </div>
              </div>
              <div className="adm-seg ntf-seg" role="group" aria-label={N.mode}>
                {["sms", "push", "both"].map((v) => (
                  <button key={v} type="button" aria-pressed={draft.mode === v} disabled={!d.rights.system} onClick={() => set({ mode: v })}>
                    {N.modeBy[v]}
                  </button>
                ))}
              </div>
              {!d.rights.system && <p className="adm-meta">{N.modeRight}</p>}
            </section>
          )}

          {smsType && d.sms && <SmsText d={d} draft={draft} set={set} words={words} bad={smsBad} />}
        </div>

        <Preview d={d} sample={sample} previews={previews} words={words} extra={draft.email ?? ""} />
      </div>

      <div className="ntf-bar">
        <p className="ntf-later">
          {state.k === "saved" ? (
            <span className="ntf-ok" role="status">
              {N.saved}
            </span>
          ) : state.k === "bad" ? (
            <span className="ntf-bad" role="alert">
              {state.text}
            </span>
          ) : (
            later
          )}
        </p>
        <div className="ntf-btns">
          <button type="button" className="adm-btn adm-btn-line" disabled={!dirty || state.k === "saving"} onClick={() => (setDraft(base), setState({ k: "idle" }))}>
            {N.cancel}
          </button>
          <button type="button" className="adm-btn adm-btn-lime" disabled={!dirty || !!smsBad || state.k === "saving"} onClick={save}>
            {state.k === "saving" ? N.saving : N.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmsText({ d, draft, set, words, bad }: { d: TypeDetail; draft: Draft; set: (p: Partial<Draft>) => void; words: string; bad: string | null }) {
  const A = useA();
  const N = A.notif;
  const box = useRef<HTMLTextAreaElement>(null);
  const standard = d.sms!.standard;
  const text = draft.sms ?? standard;
  const count = smsCount(words);
  const may = d.rights.sms;
  const put = (v: string) => set({ sms: v.trim() === standard ? null : v });
  const insert = (name: SmsVar) => {
    const el = box.current;
    const token = `{${name}}`;
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? text.length;
    put(text.slice(0, from) + token + text.slice(to));
    // the cursor after the variable, once the text is redrawn (no rAF: a hidden pane may never fire it)
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(from + token.length, from + token.length);
    }, 0);
  };
  return (
    <section className="adm-card ntf-card ntf-sms" aria-labelledby="ntf-sms-h">
      <div className="ntf-sms-top">
        <h2 id="ntf-sms-h">
          {N.smsText} <small>{N.smsTextSub}</small>
        </h2>
        {draft.sms !== null && may && (
          <button type="button" className="ntf-reset" onClick={() => set({ sms: null })}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 9h11a5 5 0 010 10H9M4 9l4-4M4 9l4 4" />
            </svg>
            {N.standard}
          </button>
        )}
      </div>
      <textarea
        ref={box}
        className="ntf-text"
        value={text}
        rows={3}
        maxLength={700}
        spellCheck={false}
        disabled={!may}
        aria-label={N.smsText}
        aria-invalid={bad ? true : undefined}
        aria-describedby="ntf-sms-count"
        onChange={(e) => put(e.target.value)}
      />
      {bad && <p className="adm-err">{bad}</p>}
      {draft.sms === null && <p className="adm-meta">{N.standardNote}</p>}
      <div className="ntf-vars">
        <span>{N.insert}</span>
        {d.sms!.vars.map((v) => (
          <button key={v} type="button" className="ntf-var" disabled={!may} onClick={() => insert(v)}>
            <b>{`{${v}}`}</b> {N.vars[v]}
          </button>
        ))}
      </div>
      <div className="ntf-counter" id="ntf-sms-count">
        <span className="adm-meta">{N.sampleNote}</span>
        <span className="ntf-meter">
          <span className={`ntf-meter-bar${count.parts > 1 ? " is-many" : ""}`} aria-hidden="true">
            <i style={{ width: `${Math.min(100, (count.chars / count.limit) * 100)}%` }} />
          </span>
          {N.counter(count.chars, count.limit, count.parts)}
        </span>
      </div>
      {count.unicode && <p className="adm-meta">{N.unicode}</p>}
      {count.parts > 1 && <p className="adm-meta ntf-warn">{N.manyParts(count.parts)}</p>}
    </section>
  );
}

/**
 * «Дополнительная информация в Email»: the salon's own text in this type's
 * letter, folded until opened (open when there is one), as Altegio has it.
 */
function EmailExtra({ text, max, may, set }: { text: string; max: number; may: boolean; set: (v: string) => void }) {
  const N = useA().notif;
  const filled = text.trim() !== "";
  // open at first when there is a text; then it stays as the user leaves it, even while he clears it
  const [startOpen] = useState(filled);
  return (
    <details className="ntf-extra" open={startOpen || undefined}>
      <summary>
        <span>{N.extra.title}</span>
        <small>{filled ? N.extra.set : N.extra.none}</small>
      </summary>
      <div className="ntf-extra-body">
        <textarea
          className="ntf-text"
          value={text}
          rows={4}
          maxLength={max}
          disabled={!may}
          aria-label={N.extra.title}
          aria-describedby="ntf-extra-hint"
          onChange={(e) => set(e.target.value)}
        />
        <p className="adm-meta ntf-extra-hint" id="ntf-extra-hint">
          <span>{N.extra.hint}</span>
          <span className="ntf-extra-count">{N.extra.count([...text].length, max)}</span>
        </p>
      </div>
    </details>
  );
}

function Preview({ d, sample, previews, words, extra }: { d: TypeDetail; sample: Sample; previews: Previews; words: string; extra: string }) {
  const A = useA();
  const N = A.notif;
  const chans = d.channels.map((c) => c.ch);
  const [ch, setCh] = useState<NChannel>(chans[0]);
  const [lang, setLang] = useState<Locale>(A.lang);
  const [device, setDevice] = useState<"iphone" | "android">("iphone");
  const salon = sample.values.salon || "REMPIRE";
  // the letter's own text where the server drew the mark; deferred, so typing stays quick
  const own = useDeferredValue(extra);
  const raw = previews.email[lang];
  const letter = raw ? { ...raw, html: raw.html.split(extraBlock(EXTRA_MARK)).join(extraBlock(own)) } : undefined;
  const push = previews.push[lang];
  return (
    <aside className="adm-card ntf-preview" aria-labelledby="ntf-pv-h">
      <div className="ntf-pv-top">
        <h2 id="ntf-pv-h">{N.preview}</h2>
        {ch !== "email" && (
          <div className="ntf-dev" role="group" aria-label={N.preview}>
            {(["iphone", "android"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>
                {v === "iphone" ? "iPhone" : "Android"}
              </button>
            ))}
          </div>
        )}
      </div>
      {chans.length > 1 && (
        <div className="ntf-pv-tabs" role="tablist" aria-label={N.preview}>
          {chans.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={ch === c} onClick={() => setCh(c)}>
              {N.ch[c]}
            </button>
          ))}
        </div>
      )}
      {ch !== "sms" && (
        <div className="ntf-pv-langs" role="group" aria-label={A.loc.langs}>
          {LOCALES.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {ch === "email" ? (
        letter ? (
          <div className="ntf-mail">
            <p className="ntf-subj">
              <span>{N.subject}:</span> <b>{letter.subject}</b>
            </p>
            <iframe title={letter.subject} className="ntf-frame" sandbox="" srcDoc={letter.html} />
          </div>
        ) : (
          <p className="adm-meta">{N.noPreview}</p>
        )
      ) : (
        <div className={`ntf-phone is-${device}`}>
          <div className="ntf-phone-bar" aria-hidden="true">
            <span>12:30</span>
          </div>
          {ch === "sms" ? (
            <>
              <div className="ntf-phone-who">
                <span className="ntf-ava" aria-hidden="true">
                  {salon.charAt(0)}
                </span>
                <b>{salon}</b>
              </div>
              <div className="ntf-phone-body">
                <p className="ntf-stamp">{N.smsAt}</p>
                <p className="ntf-bubble">{words ? linkify(words) : N.noPreview}</p>
              </div>
            </>
          ) : push ? (
            <div className="ntf-phone-body ntf-lock">
              <div className="ntf-push">
                <span className="ntf-push-app" aria-hidden="true">
                  R
                </span>
                <div>
                  <b>{push.title}</b>
                  <p>{push.body}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="adm-meta">{N.noPreview}</p>
          )}
        </div>
      )}
      <p className="ntf-sample">{N.sample(sample.staff, sample.values.time ?? "")}</p>
    </aside>
  );
}

/** A link in the bubble looks like one, as the phone draws it. */
function linkify(text: string): React.ReactNode[] {
  return text.split(/(https?:\/\/\S+)/).map((part, i) => (/^https?:\/\//.test(part) ? <u key={i}>{part}</u> : part));
}

function ChannelIcon({ ch }: { ch: NChannel }) {
  const p = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  return (
    <span className="ntf-ico">
      {ch === "sms" ? (
        <svg {...p}>
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
      ) : ch === "email" ? (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="M3 6l9 7 9-7" />
        </svg>
      ) : (
        <svg {...p}>
          <rect x="7" y="2.5" width="10" height="19" rx="2" />
          <path d="M11 18.5h2" />
        </svg>
      )}
    </span>
  );
}

