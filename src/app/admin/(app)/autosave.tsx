"use client";

/**
 * Auto-save for a part that edits something that already exists (a barber's
 * profile, prices, week; a service). There is no «Сохранить»: a change is
 * sent a moment after the last keystroke, or at once when the field is left,
 * and the place of the button says what happened: «Сохраняется…», then
 * «Сохранено» with «Вернуть как было» for a few seconds. A value that cannot
 * be saved is not sent; the line says what to fix.
 *
 * Not for anything that creates a record or reaches a client (a new visit,
 * a move, a new login): those keep their one button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { A } from "../copy";
import { TickIcon } from "../icons";

type Result = { ok: boolean; field?: string } | boolean;
type Phase = "idle" | "pending" | "saved" | "bad" | "failed";

/** After the last change, before it is sent. */
const DELAY = 800;
/** How long «Сохранено» and «Вернуть как было» stay. */
const UNDO_FOR = 8000;

export type AutoSave = { phase: Phase; text: string; canUndo: boolean; undo: () => void; retry: () => void; flush: () => void };

/**
 * `value` is the form's state and `set` its setter (for «Вернуть как было»);
 * `save` sends one value; `check` returns what is wrong with a value, or null.
 * `off` turns it all off (a form that creates has its own button).
 */
export function useAutoSave<T>(value: T, set: (v: T) => void, save: (v: T) => Promise<Result>, opts?: { check?: (v: T) => string | null; off?: boolean }): AutoSave {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const key = JSON.stringify(value);
  const check = opts?.check;
  const off = opts?.off === true;

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
    const wrong = check?.(value);
    if (wrong) {
      setPhase("bad");
      setText(wrong);
      return;
    }
    setPhase("pending");
    setCanUndo(false);
    s.timer = window.setTimeout(() => void s.run(), DELAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, off]);

  // on the way out (another page, the phone goes to another app): send what is waiting
  useEffect(() => {
    const s = r.current;
    const hidden = () => {
      if (document.visibilityState === "hidden" && s.timer) void s.run();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.clearTimeout(s.fade);
      if (s.timer) void s.run();
    };
  }, []);

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

  return { phase, text, canUndo, undo, retry, flush };
}

/**
 * Where «Сохранить» used to be: what happened to the last change. On a
 * phone the sheet also gets «Готово» (`onDone` closes it); a wide screen
 * has the part open all the time and needs no such button.
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
          <button type="button" className="adm-auto-act" onClick={auto.undo}>
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
