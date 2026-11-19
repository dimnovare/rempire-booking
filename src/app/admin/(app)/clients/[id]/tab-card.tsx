"use client";

/**
 * «Карточка клиента»: two columns, as on the design board.
 *
 * Left, the form: every field of the client, saved together by the yellow
 * «Сохранить» in the foot (the card asks before it is left with changes
 * that are not saved). The discount is stored and shown only: it changes
 * no price anywhere.
 *
 * Right, what saves by itself, each thing at once: the photo (shrunk in the
 * browser before it is sent), the comments (a dated history beside the one
 * note), and his numbers, which nobody types.
 *
 * «Удалить» asks first; a client with visits or purchases is refused,
 * plainly, and stays.
 */
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import type { ClientComment } from "@/lib/admin/client-card";
import { parseBirthday } from "@/lib/birthday";
import { LOCALES } from "@/lib/i18n";
import { normalizePhone } from "@/lib/phone";
import { eur, LANG_NAMES } from "../../../copy";
import { PlusIcon, XIcon } from "../../../icons";
import { useA } from "../../../lang";
import { useFrame } from "../../frame";
import { shrinkPhoto } from "../../photo-shrink";
import { addCommentAction, deleteClientAction, deleteCommentAction, removeClientPhotoAction, saveCardAction, uploadClientPhotoAction } from "../actions";
import { CLIENTS_CHANGED, type CardFields } from "../card-fields";
import { Ask, Switch, useCard, useFmt, useForgetOnLeave, useGuard } from "./parts";

/** The library's limits (src/lib/admin/), handed down by the page. */
export type CardLimits = { note: number; label: number; labels: number; cardNo: number; comment: number; message: number };
export type CardNumbers = { soldCents: number; soldVisits: number; firstVisit: number | null; lastVisit: number | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHOLE_RE = /^\d{1,3}$/;
const same = (a: CardFields, b: CardFields) => JSON.stringify(a) === JSON.stringify(b);

export function CardTab({
  initial,
  used,
  limits,
  photoV,
  comments,
  numbers,
  today,
  onSaved,
}: {
  initial: CardFields;
  used: string[];
  limits: CardLimits;
  photoV: string | null;
  comments: ClientComment[];
  numbers: CardNumbers;
  today: string;
  onSaved: (name: string) => void;
}) {
  const A = useA();
  const C = A.clients;
  const K = C.card;
  const card = useCard();
  const frame = useFrame();
  const form = useId();
  // what is saved, and what is in the fields
  const [base, setBase] = useState(initial);
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // what to fix; with `other`, the client who has this phone already
  const [err, setErr] = useState<{ text: string; other?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const baseRef = useRef(base);
  baseRef.current = base;
  const reset = useCallback(() => {
    setD(baseRef.current);
    setErr(null);
  }, []);
  const changed = !same(d, base);
  useGuard("card", changed, reset);
  useForgetOnLeave(() => setDone(false));

  const set = (patch: Partial<CardFields>) => {
    setD((cur) => ({ ...cur, ...patch }));
    setDone(false);
    setErr(null);
  };

  /** What cannot be saved, said before the server is asked. */
  const check = (v: CardFields): string | null => {
    if (!v.name.trim()) return A.auto.needName;
    // masked for this login (no right to the card's phones and e-mail): shown, not changed, so not checked
    if (card.may.contacts) {
      if (v.phone.trim() && !normalizePhone(v.phone)) return A.visit.invalid("phone");
      if (v.phone2.trim() && !normalizePhone(v.phone2)) return A.visit.invalid("phone2");
      if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) return A.visit.invalid("email");
    }
    if (!parseBirthday(v.birthday, today).ok) return A.visit.invalid("birthday");
    const pct = v.discount.trim();
    if (pct && (!WHOLE_RE.test(pct) || Number(pct) > 100)) return A.visit.invalid("discount");
    return null;
  };

  const save = async () => {
    if (busy) return;
    const bad = check(d);
    if (bad) return setErr({ text: bad });
    setBusy(true);
    setErr(null);
    setDone(false);
    try {
      const r = await saveCardAction(card.id, d);
      if (r.ok) {
        // as it was kept: the phone in full, the name without spare spaces
        setBase(r.card);
        setD(r.card);
        setDone(true);
        onSaved(r.card.name);
        window.dispatchEvent(new Event(CLIENTS_CHANGED));
      } else setErr(r.field === "phoneTaken" ? { text: C.taken, other: r.clientId } : { text: A.visit.invalid(r.field) });
    } catch {
      setErr({ text: A.error });
    }
    setBusy(false);
  };

  const remove = async () => {
    const r = await deleteClientAction(card.id);
    if (!r.ok) return r.code === "has_history" ? { refused: K.deleteRefused } : A.error;
    frame.say(K.deleted);
    window.dispatchEvent(new Event(CLIENTS_CHANGED));
    card.gone();
  };

  return (
    <>
      <div className="cc-scroll">
        <div className="cc-cols">
          <form
            id={form}
            className="cc-left"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="cc-field">
              <span>{A.visit.name}</span>
              <input autoComplete="off" maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <div className="cc-pair">
              <label className="cc-field">
                <span>{A.visit.phone}</span>
                <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} placeholder="+372" value={d.phone} readOnly={!card.may.contacts} onChange={(e) => set({ phone: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{K.phone2}</span>
                <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={d.phone2} readOnly={!card.may.contacts} onChange={(e) => set({ phone2: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{C.email}</span>
                <input type="email" inputMode="email" autoComplete="off" maxLength={254} value={d.email} readOnly={!card.may.contacts} onChange={(e) => set({ email: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{K.birthday}</span>
                <input inputMode="numeric" autoComplete="off" maxLength={12} placeholder="01.01.2000" title={K.birthdayHint} value={d.birthday} onChange={(e) => set({ birthday: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{K.gender}</span>
                <select value={d.gender} onChange={(e) => set({ gender: e.target.value })}>
                  <option value="">{K.genders.none}</option>
                  <option value="male">{K.genders.male}</option>
                  <option value="female">{K.genders.female}</option>
                </select>
              </label>
              <label className="cc-field">
                <span>{K.importance}</span>
                <select value={d.importance} onChange={(e) => set({ importance: e.target.value })}>
                  <option value="">{K.classes.none}</option>
                  <option value="bronze">{K.classes.bronze}</option>
                  <option value="silver">{K.classes.silver}</option>
                  <option value="gold">{K.classes.gold}</option>
                </select>
              </label>
              <label className="cc-field">
                <span>{K.cardNo}</span>
                <input autoComplete="off" maxLength={limits.cardNo} value={d.cardNo} onChange={(e) => set({ cardNo: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{K.discount}</span>
                {/* stored and shown only: no price anywhere reads it (src/lib/admin/clients.ts) */}
                <input inputMode="numeric" autoComplete="off" maxLength={3} placeholder="0" title={K.discountHint} value={d.discount} onChange={(e) => set({ discount: e.target.value })} />
              </label>
              <label className="cc-field">
                <span>{K.lang}</span>
                <select value={d.locale} onChange={(e) => set({ locale: e.target.value as CardFields["locale"] })}>
                  {LOCALES.map((l) => (
                    <option key={l} value={l} lang={l}>
                      {LANG_NAMES[l]}
                    </option>
                  ))}
                </select>
              </label>
              <Labels labels={d.labels} used={used} limits={limits} onChange={(labels) => set({ labels })} />
            </div>
            <Switch checked={d.noOnline} onChange={(noOnline) => set({ noOnline })}>
              {K.noOnline}
            </Switch>
            <div className="cc-field">
              <label htmlFor={`${form}-note`}>{K.note}</label>
              <textarea id={`${form}-note`} rows={4} maxLength={limits.note} aria-describedby={`${form}-note-hint`} value={d.note} onChange={(e) => set({ note: e.target.value })} />
              <small id={`${form}-note-hint`}>{C.noteHint}</small>
            </div>
          </form>

          <div className="cc-right">
            <Photo v={photoV} name={base.name} />
            {card.may.comments && <Comments comments={comments} max={limits.comment} />}
            <Numbers n={numbers} />
            <button type="button" className="cc-link" onClick={() => card.go("history")}>
              {K.seeHistory}
            </button>
          </div>
        </div>
      </div>

      <footer className="cc-foot">
        {card.may.del ? (
          <button type="button" className="cc-btn" disabled={busy} onClick={() => setAsking(true)}>
            {A.remove}
          </button>
        ) : (
          <span />
        )}
        <div className="cc-foot-end">
          {err ? (
            <p className="adm-err" role="alert">
              {err.text}
              {err.other && (
                <>
                  {" "}
                  <Link href={`/admin/clients/${err.other}`} prefetch={false}>
                    {C.openHim}
                  </Link>
                </>
              )}
            </p>
          ) : (
            <p className="cc-saved" role="status">
              {done && !changed ? A.saved : ""}
            </p>
          )}
          {(card.may.edit || card.may.note) && (
            <button type="submit" form={form} className="cc-btn cc-btn-main" disabled={busy}>
              {A.save}
            </button>
          )}
        </div>
      </footer>
      {asking && <Ask title={K.deleteTitle} text={K.deleteAsk(base.name)} yes={K.deleteYes} onYes={remove} onClose={() => setAsking(false)} />}
    </>
  );
}

/** Categories: the words he carries as chips with a cross, and one field to add a word (the ones in use are offered). */
function Labels({ labels, used, limits, onChange }: { labels: string[]; used: string[]; limits: CardLimits; onChange: (labels: string[]) => void }) {
  const A = useA();
  const C = A.clients;
  const list = useId();
  const [text, setText] = useState("");
  const sameWord = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const has = (s: string) => labels.some((x) => sameWord(x, s));
  const full = labels.length >= limits.labels;
  const add = () => {
    const s = text.replace(/\s+/g, " ").trim().slice(0, limits.label).trim();
    setText("");
    if (s && !has(s) && !full) onChange([...labels, s]);
  };
  return (
    <div className="cc-field cc-labels">
      <label htmlFor={`${list}-in`}>{C.labels}</label>
      <div className="cc-label-add">
        <input
          id={`${list}-in`}
          list={list}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={limits.label}
          placeholder={C.labelPh}
          title={full ? C.labelsFull(limits.labels) : C.labelsHint}
          disabled={full}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the word; it does not save the card
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <datalist id={list}>
          {used
            .filter((u) => !has(u))
            .map((u) => (
              <option key={u} value={u} />
            ))}
        </datalist>
        <button type="button" className="cc-btn cc-btn-ico" aria-label={C.labelNew} title={C.labelNew} disabled={full || !text.trim()} onClick={add}>
          <PlusIcon size={14} />
        </button>
      </div>
      {labels.length > 0 && (
        <ul className="cc-chips">
          {labels.map((s) => (
            <li key={s}>
              <span>{s}</span>
              <button type="button" aria-label={C.labelRemove(s)} title={C.labelRemove(s)} onClick={() => onChange(labels.filter((x) => x !== s))}>
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** His photo: kept at once, on its own. Served only to a login (/admin/clients/<id>/photo). */
function Photo({ v, name }: { v: string | null; name: string }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const input = useRef<HTMLInputElement>(null);
  // what the last upload or removal here made of it; null: as the page says
  const [mine, setMine] = useState<{ v: string | null } | null>(null);
  const [state, setState] = useState<{ busy: boolean; err: string }>({ busy: false, err: "" });
  const [sent, setSent] = useState(v);
  if (sent !== v) {
    setSent(v);
    setMine(null);
  }
  const now = mine ? mine.v : v;

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ busy: true, err: "" });
    try {
      const body = new FormData();
      // on the card's white, where a see-through picture would else turn black
      body.set("photo", await shrinkPhoto(file, "#fff"), "photo.jpg");
      const r = await uploadClientPhotoAction(card.id, body);
      if (r.ok) setMine({ v: r.v });
      setState({ busy: false, err: r.ok ? "" : K.photoBad });
    } catch {
      setState({ busy: false, err: K.photoBad });
    }
  };
  const remove = async () => {
    setState({ busy: true, err: "" });
    const ok = await removeClientPhotoAction(card.id).catch(() => false);
    if (ok) setMine({ v: null });
    setState({ busy: false, err: ok ? "" : A.error });
  };

  return (
    <div className="cc-photo">
      <span className="cc-photo-box" role="img" aria-label={K.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {now ? <img src={`/admin/clients/${card.id}/photo?v=${now}`} alt="" /> : (name.trim() || "?").charAt(0).toUpperCase()}
      </span>
      <div className="cc-photo-acts">
        <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
        <button type="button" className="cc-btn" disabled={state.busy} onClick={() => input.current?.click()}>
          {state.busy ? K.photoBusy : now ? K.photoChange : K.photoAdd}
        </button>
        {now && !state.busy && (
          <button type="button" className="cc-link" onClick={() => void remove()}>
            {K.photoRemove}
          </button>
        )}
        {state.err && (
          <p className="adm-err" role="alert">
            {state.err}
          </p>
        )}
      </div>
    </div>
  );
}

/** The comments: a new one on top, then the history, newest first. Each is kept or deleted at once. */
function Comments({ comments, max }: { comments: ClientComment[]; max: number }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const fmt = useFmt(card.tz);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState<string | null>(null);

  const add = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await addCommentAction(card.id, text);
      if (r.ok) setText("");
      else setErr(A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <section className="cc-comments" aria-label={K.comments}>
      <h2 className="cc-h">{K.comments}</h2>
      {card.may.commentAdd && (
        <>
          <label className="cc-field">
            <span>{K.commentNew}</span>
            <textarea rows={3} maxLength={max} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="button" className="cc-btn cc-btn-start" disabled={busy} onClick={() => void add()}>
            {A.add}
          </button>
        </>
      )}
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
      {comments.length === 0 ? (
        <p className="cc-meta">{K.commentNone}</p>
      ) : (
        <ul className="cc-comment-list">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="cc-comment-head">
                <span>
                  {c.author ? `${c.author} · ` : ""}
                  {fmt.moment(c.at)}
                </span>
                {(c.mine ? card.may.commentDelOwn : card.may.commentDelOthers) && (
                  <button type="button" aria-label={K.commentDelete} title={K.commentDelete} onClick={() => setAsking(c.id)}>
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <p>{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <Ask
          title={K.commentDelete}
          text={K.commentAsk}
          yes={A.remove}
          onYes={async () => ((await deleteCommentAction(card.id, asking)) ? null : A.error)}
          onClose={() => setAsking(null)}
        />
      )}
    </section>
  );
}

/** What nobody types: how much he has bought and when he came. */
function Numbers({ n }: { n: CardNumbers }) {
  const A = useA();
  const C = A.clients;
  const K = C.card;
  const fmt = useFmt(useCard().tz);
  return (
    <dl className="cc-sums">
      <div>
        <dt>{K.sold}</dt>
        <dd>{K.soldFor(eur(n.soldCents), n.soldVisits)}</dd>
      </div>
      <div>
        <dt>{C.cols.first}</dt>
        <dd>{n.firstVisit == null ? "—" : fmt.long(n.firstVisit)}</dd>
      </div>
      <div>
        <dt>{C.cols.last}</dt>
        <dd>{n.lastVisit == null ? "—" : fmt.long(n.lastVisit)}</dd>
      </div>
    </dl>
  );
}
