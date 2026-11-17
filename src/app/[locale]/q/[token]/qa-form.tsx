"use client";

/**
 * Renat's questions. Every change saves itself: a choice at once, typing
 * after a short pause, and anything left when the page closes or the
 * internet drops. Unsaved values wait in this browser and go out as soon as
 * the connection is back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/brand";
import {
  DECIDED,
  DECIDED_NOTE,
  INTRO,
  isAnswered,
  QUESTIONS,
  WE_READ,
  type Field,
  type Value,
} from "@/lib/owner-qa-content";
import type { Saved } from "@/lib/owner-qa";

type Status = "saving" | "saved" | "offline" | "failed";
const TYPE_PAUSE_MS = 900;
const RETRY_MS = 5000;

const sectionOf = (field: string) => field.split(".")[0];
const hhmm = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tallinn" });
const ddmm = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Tallinn" });
function when(iso: string) {
  const d = Date.parse(iso);
  return ddmm.format(d) === ddmm.format(Date.now()) ? hhmm.format(d) : `${ddmm.format(d)}, ${hhmm.format(d)}`;
}

export function QaForm({ token, initial }: { token: string; initial: Record<string, Saved> }) {
  const draftKey = `rempire-booking:qa:${token}`;
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, s]) => [k, s.value])),
  );
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, s] of Object.entries(initial)) {
      const sec = sectionOf(k);
      if (!out[sec] || s.updatedAt > out[sec]) out[sec] = s.updatedAt;
    }
    return out;
  });

  // field → the latest value not yet confirmed by the server
  const unsent = useRef(new Map<string, Value>());
  const inflight = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const keepDraft = useCallback(() => {
    try {
      if (unsent.current.size) localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(unsent.current)));
      else localStorage.removeItem(draftKey);
    } catch {
      /* private mode: the server copy is the only one */
    }
  }, [draftKey]);

  const send = useCallback(
    async (field: string) => {
      const t = timers.current.get(field);
      if (t) clearTimeout(t);
      timers.current.delete(field);
      if (inflight.current.has(field) || !unsent.current.has(field)) return;
      const value = unsent.current.get(field)!;
      const sec = sectionOf(field);
      inflight.current.add(field);
      setStatus((s) => ({ ...s, [sec]: "saving" }));
      let next: Status = "saved";
      try {
        const res = await fetch(`/api/qa/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });
        if (!res.ok) {
          next = "failed"; // the server will not take it; retrying changes nothing
          return;
        }
        const body = (await res.json()) as { savedAt: string };
        if (unsent.current.get(field) === value) unsent.current.delete(field);
        keepDraft();
        setSavedAt((s) => ({ ...s, [sec]: body.savedAt }));
      } catch {
        next = "offline";
        timers.current.set(field, setTimeout(() => void send(field), RETRY_MS));
      } finally {
        inflight.current.delete(field);
        if (next === "saved" && unsent.current.has(field)) {
          void send(field); // typed on while this one was on its way
        } else {
          setStatus((s) => ({ ...s, [sec]: next }));
        }
      }
    },
    [token, keepDraft],
  );

  const change = useCallback(
    (field: string, value: Value, pause = 0) => {
      setValues((v) => ({ ...v, [field]: value }));
      unsent.current.set(field, value);
      keepDraft();
      const sec = sectionOf(field);
      setStatus((s) => ({ ...s, [sec]: s[sec] === "offline" ? "offline" : "saving" }));
      const t = timers.current.get(field);
      if (t) clearTimeout(t);
      if (pause) timers.current.set(field, setTimeout(() => void send(field), pause));
      else void send(field);
    },
    [send, keepDraft],
  );

  // Values left in this browser from a visit that had no internet.
  useEffect(() => {
    let draft: Record<string, Value> = {};
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) || "{}");
    } catch {
      return;
    }
    for (const [field, value] of Object.entries(draft)) change(field, value);
  }, [draftKey, change]);

  // Back online, or the page is closing: send what is left.
  useEffect(() => {
    const online = () => unsent.current.forEach((_, f) => void send(f));
    const leaving = () => {
      unsent.current.forEach((value, field) => {
        if (inflight.current.has(field)) return;
        void fetch(`/api/qa/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
          keepalive: true,
        }).catch(() => {});
      });
    };
    const hidden = () => document.visibilityState === "hidden" && leaving();
    window.addEventListener("online", online);
    window.addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", leaving);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [send, token]);

  const answered = QUESTIONS.filter((q) => q.fields.some((f) => isAnswered(values[`${q.id}.${f.id}`]))).length;

  const statusLine = (sec: string) => {
    const s = status[sec];
    const at = savedAt[sec];
    if (s === "saving") return <span className="qa-st">Сохраняю…</span>;
    if (s === "offline") return <span className="qa-st warn">Нет интернета. Сохраню, когда появится</span>;
    if (s === "failed") return <span className="qa-st warn">Не сохранилось. Напиши Диме</span>;
    if (at)
      return (
        <span className="qa-st ok">
          <CheckIcon size={14} width={3} /> Сохранено {when(at)}
        </span>
      );
    return <span className="qa-st" />;
  };

  const input = (sec: string, f: Field) => {
    const key = `${sec}.${f.id}`;
    const id = `f-${sec}-${f.id}`;
    const v = values[key];
    if (f.kind === "one" || f.kind === "many") {
      const many = f.kind === "many";
      const chosen = many ? (Array.isArray(v) ? v : []) : typeof v === "string" ? v : "";
      return (
        <div className="qa-field" key={key}>
          <p className="qa-label" id={id}>
            {f.label}
          </p>
          <div className="qa-opts" role={many ? "group" : "radiogroup"} aria-labelledby={id}>
            {f.options.map((o) => {
              const on = many ? (chosen as string[]).includes(o) : chosen === o;
              return (
                <button
                  key={o}
                  type="button"
                  role={many ? "checkbox" : "radio"}
                  aria-checked={on}
                  className={`qa-opt${many ? " sq" : ""}`}
                  onClick={() => {
                    if (many) {
                      const list = chosen as string[];
                      change(key, on ? list.filter((x) => x !== o) : [...list, o]);
                    } else change(key, on ? "" : o);
                  }}
                >
                  <span className="qa-tick" aria-hidden="true">
                    {on && (many ? <CheckIcon size={14} width={3.2} /> : <i />)}
                  </span>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    if (f.kind === "money") {
      return (
        <div className="qa-field qa-money" key={key}>
          <label className="qa-label" htmlFor={id}>
            {f.label}
          </label>
          <div className="qa-eur">
            <input
              id={id}
              className="input"
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              placeholder={f.hint}
              value={typeof v === "string" ? v : ""}
              onChange={(e) => change(key, e.target.value, TYPE_PAUSE_MS)}
              onBlur={() => void send(key)}
            />
            <span aria-hidden="true">€</span>
          </div>
        </div>
      );
    }
    return (
      <div className="qa-field" key={key}>
        <label className="qa-label" htmlFor={id}>
          {f.label}
        </label>
        <textarea
          id={id}
          className="input"
          rows={(f.kind === "text" && f.rows) || 3}
          maxLength={5000}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => change(key, e.target.value, TYPE_PAUSE_MS)}
          onBlur={() => void send(key)}
        />
      </div>
    );
  };

  return (
    <div className="qa">
      <h1 className="h1">Вопросы по новой системе</h1>
      <p className="lead">{INTRO}</p>
      <p className="qa-count" aria-live="polite">
        Отвечено {answered} из {QUESTIONS.length}
      </p>

      <ol className="qa-list">
        {QUESTIONS.map((q, i) => (
          <li key={q.id} className="qa-q" aria-labelledby={`q-${q.id}`}>
            <div className="qa-head">
              <span className="qa-n" aria-hidden="true">
                {i + 1}
              </span>
              <h2 className="qa-title" id={`q-${q.id}`}>
                {q.title}
              </h2>
            </div>
            <p className="qa-lead">{q.lead}</p>
            {q.fields.map((f) => input(q.id, f))}
            <p className="qa-stl" aria-live="polite">
              {statusLine(q.id)}
            </p>
          </li>
        ))}
      </ol>

      <section className="qa-q qa-done" aria-labelledby="q-decided">
        <h2 className="qa-title" id="q-decided">
          Уже решено
        </h2>
        <ul className="qa-ticks">
          {DECIDED.map((d) => (
            <li key={d}>
              <CheckIcon size={16} width={3} />
              <span>{d}</span>
            </li>
          ))}
        </ul>
        {input("decided", DECIDED_NOTE)}
        <p className="qa-stl" aria-live="polite">
          {statusLine("decided")}
        </p>
      </section>

      <section className="qa-q qa-read" aria-labelledby="q-read">
        <h2 className="qa-title" id="q-read">
          Это посмотрим сами
        </h2>
        <p className="qa-lead">Когда получим доступ к Altegio и Isolta. Об этом не спрашиваем.</p>
        <ul className="qa-plain">
          {WE_READ.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <p className="qa-end">Отправлять ничего не нужно: всё уже сохранено, Дима увидит. Можно вернуться по этой же ссылке и дописать.</p>
    </div>
  );
}
