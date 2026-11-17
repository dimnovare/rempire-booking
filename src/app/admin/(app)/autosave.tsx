"use client";

/**
 * Auto-save for a part that edits something that already exists (a barber's
 * profile, prices, week; a service). There is no «Сохранить»: a change is
 * sent a moment after the last keystroke, or at once when the field is left.
 * A value that cannot be saved is not sent.
 *
 * What happened is said in two places:
 * - the part's own line, where the button used to be (`SaveState`):
 *   «Сохраняется…», «Сохранено», or what to fix. On a phone this line sits
 *   in the sheet's bottom bar with «Вернуть как было» and «Готово», so the
 *   bar is the message and nothing floats over the sheet;
 * - on a wide screen, where that line can be far below the field, one small
 *   box at the bottom left (`SaveToast`): «Сохранено» with «Вернуть как
 *   было» for a few seconds, or what was not saved, until it is fixed.
 *
 * Not for anything that creates a record or reaches a client (a new visit,
 * a move, a new login): those keep their one button.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { A } from "../copy";
import { TickIcon } from "../icons";

type Result = { ok: boolean; field?: string } | boolean;
type Phase = "idle" | "pending" | "saved" | "bad" | "failed";

/** After the last change, before it is sent. */
const DELAY = 800;
/** How long a part's line says «Сохранено» (and, on a phone, offers «Вернуть как было»). */
const UNDO_FOR = 8000;
/** How long the box stays; it waits while the mouse or the keyboard is on it. */
const TOAST_FOR = 5000;

/* ---------- what the box shows: at most one note per part, the newest wins ---------- */

type Note = { id: number; kind: "saved" | "bad" | "failed"; label: string; text: string; undo?: () => void; retry?: () => void; at: number };
const NONE: Note[] = [];
let notes: Note[] = NONE;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const put = (n: Note) => {
  notes = [...notes.filter((x) => x.id !== n.id), n];
  emit();
};
const drop = (id: number) => {
  if (!notes.some((x) => x.id === id)) return;
  notes = notes.filter((x) => x.id !== id);
  emit();
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export type AutoSave = { phase: Phase; text: string; canUndo: boolean; undo: () => void; retry: () => void; flush: () => void };

/**
 * `value` is the form's state and `set` its setter (for «Вернуть как было»);
 * `save` sends one value. `check` returns what is wrong with a value, or
 * null; `label` names the part in the box when something is not saved;
 * `off` turns it all off (a form that creates has its own button).
 */
export function useAutoSave<T>(value: T, set: (v: T) => void, save: (v: T) => Promise<Result>, opts?: { check?: (v: T) => string | null; label?: string; off?: boolean }): AutoSave {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const key = JSON.stringify(value);
  const check = opts?.check;
  const label = opts?.label ?? "";
  const off = opts?.off === true;
  const id = useRef(0);
  if (!id.current) id.current = ++seq;

  // what timers and the last save on the way out need: always the latest
  const r = useRef({ value, key, saved: key, before: null as T | null, at: 0, undoing: false, busy: false, timer: 0, fade: 0, save, check, run: async () => {} });

  const run = async () => {
    const s = r.current;
    window.clearTimeout(s.timer);
    s.timer = 0;
    if (s.busy || s.key === s.saved) return;
    const wrong = s.check?.(s.value);
    if (wrong) {
      setPhase("bad");
      setText(wrong);
      return;
    }
    s.busy = true;
    const sentKey = s.key;
    let ok = false;
    let field: string | undefined;
    let threw = false;
    try {
      const res = await s.save(s.value);
      ok = typeof res === "boolean" ? res : res.ok;
      field = typeof res === "object" && !res.ok ? res.field : undefined;
    } catch {
      threw = true;
    }
    s.busy = false;
    if (ok) {
      // «Вернуть как было» goes back to before this run of changes, not to its last keystroke
      if (s.undoing) s.before = null;
      else if (s.before == null || Date.now() - s.at > UNDO_FOR) s.before = JSON.parse(s.saved) as T;
      s.undoing = false;
      s.at = Date.now();
      s.saved = sentKey;
    }
    // changed while this one was on its way: the newer value goes next
    if (s.key !== sentKey) return void s.run();
    if (threw) return setPhase("failed");
    if (!ok) {
      setText(field ? A.visit.invalid(field.split(":")[0]) : A.error);
      return setPhase("bad");
    }
    setPhase("saved");
    setCanUndo(s.before != null);
    window.clearTimeout(s.fade);
    s.fade = window.setTimeout(() => {
      setCanUndo(false);
      setPhase((p) => (p === "saved" ? "idle" : p));
    }, UNDO_FOR);
  };

  useEffect(() => {
    const s = r.current;
    s.value = value;
    s.key = key;
    s.save = save;
    s.check = check;
    s.run = run;
  });

  // a change: wait a moment, then send
  useEffect(() => {
    const s = r.current;
    if (off) return;
    window.clearTimeout(s.timer);
    s.timer = 0;
    if (key === s.saved) {
      // typed and put back: nothing to save
      setPhase((p) => (p === "pending" || p === "bad" ? "idle" : p));
      return;
    }
    // a value on its way to a good one («4» before «45») is not called wrong
    // until the typing stops; one that is already called wrong stays so
    const wrong = check?.(value);
    if (wrong) setText(wrong);
    setPhase((p) => (wrong && p === "bad" ? "bad" : "pending"));
    setCanUndo(false);
    s.timer = window.setTimeout(() => void s.run(), DELAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, off]);

  const flush = useCallback(() => {
    if (r.current.timer) void r.current.run();
  }, []);
  const retry = useCallback(() => void r.current.run(), []);
  const undo = useCallback(() => {
    const b = r.current.before;
    if (b == null) return;
    r.current.undoing = true;
    setCanUndo(false);
    set(b);
  }, [set]);

  // tell the box
  useEffect(() => {
    if (off) return;
    const n = id.current;
    if (phase === "saved") put({ id: n, kind: "saved", label, text: A.saved, undo: canUndo ? undo : undefined, at: Date.now() });
    else if (phase === "bad") put({ id: n, kind: "bad", label, text, at: Date.now() });
    else if (phase === "failed") put({ id: n, kind: "failed", label, text: A.auto.failed, retry, at: Date.now() });
    // a new change takes the old news away. «Сохранено» is the box's to end
    // (it waits while the mouse is on it); the line going quiet does not end it
    else if (phase === "pending" || notes.some((x) => x.id === n && x.kind !== "saved")) drop(n);
  }, [phase, canUndo, text, label, off, undo, retry]);

  // on the way out (another page, the phone goes to another app): send what is waiting
  useEffect(() => {
    const s = r.current;
    const n = id.current;
    const hidden = () => {
      if (document.visibilityState === "hidden" && s.timer) void s.run();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.clearTimeout(s.fade);
      if (s.timer) void s.run();
      // a page kept hidden for «back» must not come back saying «Сохранено»
      setPhase((p) => (p === "saved" ? "idle" : p));
      setCanUndo(false);
      drop(n);
    };
  }, []);

  return { phase, text, canUndo, undo, retry, flush };
}

/**
 * Where «Сохранить» used to be: what happened to the last change. On a
 * phone the sheet also gets «Вернуть как было» and «Готово» (`onDone`
 * closes it); a wide screen has the part open all the time and the box.
 */
export function SaveState({ auto, onDone }: { auto: AutoSave; onDone?: () => void }) {
  const { phase } = auto;
  return (
    <div className="adm-auto">
      <div className="adm-auto-st">
        <span role="status" aria-live="polite" className={phase === "saved" ? "ok" : phase === "bad" || phase === "failed" ? "bad" : undefined}>
          {phase === "idle" && A.auto.idle}
          {phase === "pending" && A.auto.saving}
          {phase === "saved" && (
            <>
              <TickIcon size={14} />
              {A.saved}
            </>
          )}
          {phase === "bad" && auto.text}
          {phase === "failed" && A.auto.failed}
        </span>
        {phase === "saved" && auto.canUndo && (
          <button type="button" className="adm-auto-act only-narrow" onClick={auto.undo}>
            {A.auto.undo}
          </button>
        )}
        {phase === "failed" && (
          <button type="button" className="adm-auto-act" onClick={auto.retry}>
            {A.auto.retry}
          </button>
        )}
      </div>
      {onDone && (
        <button
          type="button"
          className="adm-btn adm-btn-lime only-narrow"
          onClick={() => {
            auto.flush();
            onDone();
          }}
        >
          {A.auto.done}
        </button>
      )}
    </div>
  );
}

/**
 * The box, once in the admin's layout; wide screens only. Bottom left,
 * always the same spot (on «Барберы» that is the empty end of the list),
 * one at a time, and it never takes the cursor out of a field. The part's
 * own line is the live region, so a screen reader hears each save once.
 */
export function SaveToast() {
  const list = useSyncExternalStore(
    subscribe,
    () => notes,
    () => NONE,
  );
  const [held, setHeld] = useState(false);
  const top = list.length ? list.reduce((a, b) => (b.at > a.at ? b : a)) : null;

  useEffect(() => {
    if (!top) return setHeld(false);
    if (top.kind !== "saved" || held) return;
    const t = window.setTimeout(() => drop(top.id), Math.max(1200, top.at + TOAST_FOR - Date.now()));
    return () => window.clearTimeout(t);
  }, [top, held]);

  if (!top) return null;
  return (
    <div
      key={`${top.id}:${top.at}`}
      className={`adm-savetoast only-wide is-${top.kind}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {top.kind === "saved" ? (
        <span className="m">
          <TickIcon size={14} />
          {top.text}
        </span>
      ) : (
        <>
          <span className="m">{A.auto.notSaved(top.label)}</span>
          <small>{top.text}</small>
        </>
      )}
      {top.undo && (
        <button
          type="button"
          onClick={() => {
            top.undo?.();
            setHeld(false);
            drop(top.id);
          }}
        >
          {A.auto.undo}
        </button>
      )}
      {top.retry && (
        <button type="button" onClick={top.retry}>
          {A.auto.retry}
        </button>
      )}
    </div>
  );
}
