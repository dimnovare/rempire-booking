"use client";

/**
 * What the client base does with its list, from 900px (the owner,
 * 19.11.2026; docs/reference-looks.md, «Клиенты»):
 *
 *   «Операции с Excel»  the list as an .xlsx file (the owner's login only);
 *                       the import is shown and waits for its turn.
 *   the cog             which columns the table has; kept for the login.
 *   the pager           «Назад 1 2 3 … Вперёд».
 *   «Действия»          a message to many, a category for many, deleting
 *                       many. It is for the rows that are ticked or, with
 *                       none ticked, for the whole list as it is filtered,
 *                       and it always says first for how many clients.
 *
 * A mass message is asked about twice: its window counts who gets it by
 * each channel (who switched a channel off or asked for no advertising is
 * left out), and «Отправить» there only opens the question «Отправить N SMS
 * (M частей) и K писем?». Nothing is queued before the «yes» to that.
 */
import { useEffect, useId, useState } from "react";
import type { ClientChannel } from "@/lib/client-notify";
import { CLIENT_COLUMNS, type ClientColumn } from "@/lib/admin/client-columns";
import { smsSegments } from "@/lib/sms";
import { CaretIcon, CogIcon, TickIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Pop } from "../pop";
import { bulkDeleteAction, bulkLabelAction, massPreviewAction, massSendAction, type MassPreviewed, type TargetInput } from "./actions";
import type { ClientQuery } from "./query";

const CHANNELS: readonly ClientChannel[] = ["sms", "email", "push"];

/* ---------- «Операции с Excel» ---------- */

export function ExcelMenu({ owner, question }: { owner: boolean; question: ClientQuery }) {
  const A = useA();
  const B = A.clients.base;
  const frame = useFrame();
  const [busy, setBusy] = useState(false);

  /** The file comes as the answer to a POST (the search stays out of the address), then is saved under its own name. */
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/admin/clients/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(question) });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "clients.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      frame.say(B.exported(Number(res.headers.get("x-rows")) || 0));
    } catch {
      frame.say(A.error, true);
    }
    setBusy(false);
  };

  return (
    <Pop
      kind="menu"
      name={B.excel}
      button={
        <>
          <span>{B.excel}</span>
          <CaretIcon size={10} />
        </>
      }
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            className="jr-item"
            disabled={!owner || busy}
            onClick={() => {
              close();
              void save();
            }}
          >
            <span>{B.exportXlsx}</span>
            {!owner && <small>{B.ownerOnly}</small>}
          </button>
          <button type="button" role="menuitem" className="jr-item" disabled>
            <span>{B.importXlsx}</span>
            <small>{B.soon}</small>
          </button>
        </>
      )}
    </Pop>
  );
}

/* ---------- the table's columns ---------- */

export function ColumnsMenu({ columns, onChange }: { columns: readonly ClientColumn[]; onChange: (next: ClientColumn[]) => void }) {
  const B = useA().clients.base;
  return (
    <Pop kind="menu" name={B.columns} label={B.columns} title={B.columns} icon className="cb-cog" button={<CogIcon />}>
      {() =>
        CLIENT_COLUMNS.map((c) => {
          const on = columns.includes(c);
          return (
            <button key={c} type="button" role="menuitemcheckbox" aria-checked={on} className="jr-item" onClick={() => onChange(CLIENT_COLUMNS.filter((x) => (x === c ? !on : columns.includes(x))))}>
              <span className={`jr-box${on ? " is-on" : ""}`}>
                <TickIcon size={10} />
              </span>
              <span>{B.cols[c]}</span>
            </button>
          );
        })
      }
    </Pop>
  );
}

/* ---------- the pager ---------- */

/** The pages to name: the first, the last, the open one and its two neighbours; 0 is a gap. */
function pageNumbers(page: number, pages: number): number[] {
  const want = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: number[] = [];
  for (const n of want) {
    if (out.length && n - out[out.length - 1] > 1) out.push(0);
    out.push(n);
  }
  return out;
}

export function Pager({ page, pages, busy, onTurn }: { page: number; pages: number; busy: boolean; onTurn: (page: number) => void }) {
  const A = useA();
  const C = A.clients;
  const B = C.base;
  return (
    <nav className="cb-pager" aria-label={C.pages}>
      <button type="button" disabled={page <= 1 || busy} onClick={() => onTurn(page - 1)}>
        {C.prev}
      </button>
      {pageNumbers(page, pages).map((n, i) =>
        n ? (
          <button key={n} type="button" aria-label={B.pageN(n)} aria-current={n === page ? "page" : undefined} disabled={busy && n !== page} onClick={() => n !== page && onTurn(n)}>
            {n}
          </button>
        ) : (
          <span key={`gap-${i}`} aria-hidden="true">
            …
          </span>
        ),
      )}
      <button type="button" disabled={page >= pages || busy} onClick={() => onTurn(page + 1)}>
        {B.forward}
      </button>
    </nav>
  );
}

/* ---------- «Действия» ---------- */

export type Doing = "send" | "label" | "delete";
/** An action that was picked: what, for whom (fixed when it is picked), and the line that says for how many. */
export type Started = { what: Doing; target: TargetInput; who: string };

/** The button «Действия» and its menu: the first line says for how many clients, then what can be done. */
export function ActionsMenu({
  ticked,
  total,
  question,
  owner,
  onStart,
}: {
  /** the ticked rows; with none, the action is for the whole filtered list */
  ticked: readonly string[];
  /** how many clients the list's filter leaves */
  total: number;
  /** the list's own question, as it was last answered */
  question: ClientQuery;
  owner: boolean;
  onStart: (s: Started) => void;
}) {
  const B = useA().clients.base;
  const n = ticked.length || total;
  const who = ticked.length ? B.chosen(n) : B.whole(n);
  return (
    <Pop
      kind="menu"
      name={B.actions}
      place="up"
      button={
        <>
          <span>{B.actions}</span>
          <CaretIcon size={10} />
        </>
      }
    >
      {(shut) => {
        const item = (what: Doing, text: string, danger = false) => (
          <button
            type="button"
            role="menuitem"
            className={`jr-item${danger ? " cb-danger" : ""}`}
            disabled={!n}
            onClick={() => {
              shut();
              onStart({ what, target: ticked.length ? { ids: [...ticked] } : { filter: question }, who });
            }}
          >
            <span>{text}</span>
          </button>
        );
        return (
          <>
            <p className="cb-who">{who}</p>
            {item("send", B.send)}
            {item("label", B.addLabel)}
            {owner && item("delete", B.del, true)}
          </>
        );
      }}
    </Pop>
  );
}

/**
 * The window of the action that was picked. Drawn beside the list, not in
 * its bottom bar: a bar that sticks is a layer of its own, and a window
 * inside it would lie under the sidebar.
 */
export function ActionDialog({ started, labels, onClose, onDone }: { started: Started; labels: string[]; onClose: () => void; onDone: () => void }) {
  const { what, target, who } = started;
  if (what === "send") return <SendDialog target={target} who={who} onClose={onClose} onDone={onDone} />;
  if (what === "label") return <LabelDialog target={target} who={who} labels={labels} onClose={onClose} onDone={onDone} />;
  return <DeleteDialog target={target} who={who} onClose={onClose} onDone={onDone} />;
}

/** A window in the middle of the screen: white, 12px corners. Escape and a click beside it close it, unless it is busy. */
function Dialog({ title, alert, busy, onClose, children }: { title: string; alert?: boolean; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask cb-dialog" role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** «Отправить сообщение»: the words, the channels with who gets it by each, then the second question. */
function SendDialog({ target, who, onClose, onDone }: { target: TargetInput; who: string; onClose: () => void; onDone: () => void }) {
  const A = useA();
  const B = A.clients.base;
  const K = A.clients.card;
  const frame = useFrame();
  const textId = useId();
  const [text, setText] = useState("");
  const [on, setOn] = useState<ClientChannel[]>([]);
  // who it would reach: counted as the window opens; null while it is counted, false when that failed
  const [counts, setCounts] = useState<MassPreviewed | false>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    massPreviewAction(target).then(
      (r) => live && setCounts(r ?? false),
      () => live && setCounts(false),
    );
    return () => {
      live = false;
    };
  }, [target]);

  const sms = smsSegments(text.trim());
  const chosen = counts ? on.filter((c) => counts[c].ok > 0) : [];
  const will = { sms: chosen.includes("sms") && counts ? counts.sms.ok : 0, email: chosen.includes("email") && counts ? counts.email.ok : 0, push: chosen.includes("push") && counts ? counts.push.ok : 0 };

  const next = () => {
    if (!text.trim()) return setErr(K.msgNeedText);
    if (!chosen.length) return setErr(K.msgNeedChannel);
    setErr(null);
    setAsking(true);
  };
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await massSendAction(target, { text, channels: chosen });
      if (r.ok) {
        frame.say(B.queued(r));
        onDone();
        return onClose();
      }
      setErr(r.code === "nobody" ? B.nobody : r.code === "text" ? K.msgNeedText : r.code === "channels" ? K.msgNeedChannel : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
    setAsking(false);
  };

  if (asking)
    return (
      <Dialog title={B.confirmTitle} alert busy={busy} onClose={() => setAsking(false)}>
        <p>{B.confirm({ ...will, parts: will.sms * sms.segments })}</p>
        <p className="adm-meta">{who}</p>
        <div className="cc-ask-btns">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={() => setAsking(false)}>
            {A.back}
          </button>
          <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void send()}>
            {B.confirmYes}
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title={B.send} busy={busy} onClose={onClose}>
      <p className="cb-who">{who}</p>
      <div className="cc-field">
        <label htmlFor={textId}>{K.msgText}</label>
        <textarea
          id={textId}
          rows={5}
          maxLength={1000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
        />
        <small>{K.msgCount(text.trim().length, text.trim() ? sms.segments : 0)}</small>
      </div>
      <fieldset className="cc-group cb-channels">
        <legend>{K.msgChannels}</legend>
        {counts === null && <p className="adm-meta">{B.counting}</p>}
        {counts === false && <p className="adm-err">{A.error}</p>}
        {counts &&
          CHANNELS.map((c) => {
            const k = counts[c];
            const left = [k.none ? `${B.leftNone[c]}: ${k.none}` : "", k.off ? `${B.leftOff}: ${k.off}` : ""].filter(Boolean).join(" · ");
            return (
              <label key={c} className={`cc-check${k.ok ? "" : " is-off"}`}>
                <input
                  type="checkbox"
                  checked={on.includes(c) && k.ok > 0}
                  disabled={!k.ok}
                  onChange={(e) => {
                    setOn(e.target.checked ? [...on, c] : on.filter((x) => x !== c));
                    setErr(null);
                  }}
                />
                <span>
                  {K.channels[c]}
                  <small data-channel={c}>
                    {B.gets(k.ok)}
                    {left && ` · ${left}`}
                    {c === "sms" && on.includes("sms") && k.ok > 0 && text.trim() ? ` · ${B.smsParts(sms.segments, sms.segments * k.ok)}` : ""}
                  </small>
                </span>
              </label>
            );
          })}
      </fieldset>
      {counts && counts.ads > 0 && <p className="adm-meta">{B.sendAds(counts.ads)}</p>}
      {counts && !counts.smsReady && counts.sms.ok > 0 && <p className="adm-meta">{B.smsWaits}</p>}
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
      <div className="cc-ask-btns">
        <button type="button" className="cc-btn" onClick={onClose}>
          {A.cancel}
        </button>
        <button type="button" className="cc-btn cc-btn-main" disabled={!counts} onClick={next}>
          {K.sendBtn}
        </button>
      </div>
    </Dialog>
  );
}

/** «Добавить в категорию»: one of the categories in use, or a new word. */
function LabelDialog({ target, who, labels, onClose, onDone }: { target: TargetInput; who: string; labels: string[]; onClose: () => void; onDone: () => void }) {
  const A = useA();
  const C = A.clients;
  const B = C.base;
  const frame = useFrame();
  const id = useId();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!label.trim()) return setErr(A.visit.invalid("labels"));
    setBusy(true);
    setErr(null);
    try {
      const r = await bulkLabelAction(target, label);
      if (r.ok) {
        frame.say(B.labelDone(r));
        onDone();
        return onClose();
      }
      setErr(r.field === "label" ? A.visit.invalid("labels") : A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <Dialog title={B.addLabel} busy={busy} onClose={onClose}>
      <p className="cb-who">{who}</p>
      <form
        className="cb-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="cc-field">
          <label htmlFor={id}>{B.labelPick}</label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input id={id} list={`${id}-used`} autoFocus autoComplete="off" maxLength={30} placeholder={C.labelPh} value={label} onChange={(e) => setLabel(e.target.value)} />
          <datalist id={`${id}-used`}>
            {labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
        <div className="cc-ask-btns">
          <button type="button" className="cc-btn" disabled={busy} onClick={onClose}>
            {A.cancel}
          </button>
          <button type="submit" className="cc-btn cc-btn-main" disabled={busy}>
            {A.add}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** «Удалить из базы»: asked first; then it says how many went and how many stayed and why. */
function DeleteDialog({ target, who, onClose, onDone }: { target: TargetInput; who: string; onClose: () => void; onDone: () => void }) {
  const A = useA();
  const B = A.clients.base;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ deleted: number; kept: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await bulkDeleteAction(target);
      if (r.ok) {
        setDone({ deleted: r.deleted, kept: B.delKept(r.kept) });
        onDone();
      } else setErr(A.error);
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <Dialog title={B.del} alert busy={busy} onClose={onClose}>
      {done ? (
        <p role="status">
          {B.delDone(done.deleted)}
          {done.kept && ` ${done.kept}`}
        </p>
      ) : (
        <>
          <p className="cb-who">{who}</p>
          <p>{B.delAsk}</p>
          {err && (
            <p className="adm-err" role="alert">
              {err}
            </p>
          )}
        </>
      )}
      <div className="cc-ask-btns">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={onClose}>
          {done ? A.close : A.cancel}
        </button>
        {!done && (
          <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void run()}>
            {B.delYes}
          </button>
        )}
      </div>
    </Dialog>
  );
}
