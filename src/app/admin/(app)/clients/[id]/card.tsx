"use client";

/**
 * One client's three parts: his fields, his categories, the shared note.
 * Each saves by itself (autosave.tsx) and sends only its own fields, so two
 * parts never overwrite each other; the line at the bottom of a part says
 * what happened to its last change.
 */
import { useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { normalizePhone } from "@/lib/phone";
import { LANG_NAMES } from "../../../copy";
import { PlusIcon, XIcon } from "../../../icons";
import { useA } from "../../../lang";
import { SaveState, useAutoSave } from "../../autosave";
import { saveClientAction } from "../actions";

type Data = { name: string; phone: string; email: string; locale: Locale; sms: boolean; mail: boolean };
export type CardInitial = Data & { labels: string[]; note: string };
/** The library's limits (src/lib/admin/clients.ts), handed down by the page. */
type Limits = { note: number; label: number; labels: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClientCard({ id, initial, used, limits }: { id: string; initial: CardInitial; used: string[]; limits: Limits }) {
  const { labels, note, ...data } = initial;
  return (
    <div className="adm-cards">
      <DataPart id={id} initial={data} />
      <LabelsPart id={id} initial={labels} used={used} limits={limits} />
      <NotePart id={id} initial={note} max={limits.note} />
    </div>
  );
}

function DataPart({ id, initial }: { id: string; initial: Data }) {
  const A = useA();
  const C = A.clients;
  const [d, setD] = useState(initial);
  const auto = useAutoSave<Data>(d, setD, (v) => saveClientAction(id, { name: v.name, phone: v.phone, email: v.email, locale: v.locale, smsOptOut: !v.sms, emailOptOut: !v.mail }), {
    label: C.data,
    // a half-typed phone or e-mail is not sent
    check: (v) => {
      if (!v.name.trim()) return A.auto.needName;
      if (v.phone.trim() && !normalizePhone(v.phone)) return A.visit.invalid("phone");
      if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) return A.visit.invalid("email");
      return null;
    },
  });
  return (
    <section className="adm-card" aria-label={C.data}>
      <h2 className="adm-card-h">{C.data}</h2>
      <form
        className="adm-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
      >
        <label className="adm-field">
          <span>{A.visit.name}</span>
          <input required autoComplete="off" maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </label>
        <label className="adm-field">
          <span>{A.visit.phone}</span>
          <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} placeholder="+372" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </label>
        <label className="adm-field">
          <span>{C.email}</span>
          <input type="email" inputMode="email" autoComplete="off" maxLength={254} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </label>
        <div className="adm-field">
          <span>{C.lang}</span>
          <div className="adm-seg adm-seg-wide" role="group" aria-label={C.lang}>
            {LOCALES.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={d.locale === l} onClick={() => setD({ ...d, locale: l })}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="adm-toggle">
            <span>{C.sms}</span>
            <input type="checkbox" role="switch" className="adm-sw" checked={d.sms} onChange={(e) => setD({ ...d, sms: e.target.checked })} />
          </label>
          <label className="adm-toggle">
            <span>{C.mail}</span>
            <input type="checkbox" role="switch" className="adm-sw" checked={d.mail} onChange={(e) => setD({ ...d, mail: e.target.checked })} />
          </label>
        </div>
        <SaveState auto={auto} />
      </form>
    </section>
  );
}

/** Categories: chips with a cross, a field for a new word, and the words other clients carry, one tap each. */
function LabelsPart({ id, initial, used, limits }: { id: string; initial: string[]; used: string[]; limits: Limits }) {
  const A = useA();
  const C = A.clients;
  const [labels, setLabels] = useState(initial);
  const [text, setText] = useState("");
  const auto = useAutoSave<string[]>(labels, setLabels, (v) => saveClientAction(id, { labels: v }), { label: C.labels });
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const has = (s: string) => labels.some((x) => same(x, s));
  const full = labels.length >= limits.labels;
  const add = (raw: string) => {
    const s = raw.replace(/\s+/g, " ").trim().slice(0, limits.label).trim();
    setText("");
    if (s && !has(s) && !full) setLabels([...labels, s]);
  };
  const free = used.filter((u) => !has(u));
  return (
    <section className="adm-card" aria-label={C.labels}>
      <h2 className="adm-card-h">{C.labels}</h2>
      {labels.length === 0 ? (
        <p className="adm-meta">{C.noLabels}</p>
      ) : (
        <ul className="cl-chips">
          {labels.map((s) => (
            <li key={s} className="cl-chip">
              <span>{s}</span>
              <button type="button" aria-label={C.labelRemove(s)} title={C.labelRemove(s)} onClick={() => setLabels(labels.filter((x) => x !== s))}>
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="cl-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
        }}
      >
        <input autoComplete="off" enterKeyHint="done" maxLength={limits.label} placeholder={C.labelPh} aria-label={C.labelNew} disabled={full} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="adm-btn adm-btn-line adm-btn-sm" disabled={full || !text.trim()}>
          <PlusIcon size={14} />
          {A.add}
        </button>
      </form>
      {full && <p className="adm-meta">{C.labelsFull(limits.labels)}</p>}
      {free.length > 0 && !full && (
        <div className="cl-used" role="group" aria-label={C.used}>
          <span>{C.used}</span>
          {free.map((u) => (
            <button key={u} type="button" className="adm-chip" onClick={() => add(u)}>
              <PlusIcon size={12} />
              {u}
            </button>
          ))}
        </div>
      )}
      <p className="adm-meta">{C.labelsHint}</p>
      <SaveState auto={auto} />
    </section>
  );
}

function NotePart({ id, initial, max }: { id: string; initial: string; max: number }) {
  const A = useA();
  const C = A.clients;
  const [note, setNote] = useState(initial);
  const auto = useAutoSave<string>(note, setNote, (v) => saveClientAction(id, { note: v }), { label: C.note });
  return (
    <section className="adm-card" aria-label={C.note}>
      <h2 className="adm-card-h">{C.note}</h2>
      <form className="adm-form" onBlur={auto.flush} onSubmit={(e) => e.preventDefault()}>
        <textarea rows={5} maxLength={max} aria-label={C.note} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="adm-meta">{C.noteHint}</p>
        <SaveState auto={auto} />
      </form>
    </section>
  );
}
