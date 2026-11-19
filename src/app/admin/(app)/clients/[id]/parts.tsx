"use client";

/**
 * What the tabs of a client's card share: the card itself (which client,
 * how to change tab or close, who has changes that are not saved), the
 * small question before something that cannot be taken back, the switch
 * and the tick in the drawer's look, and the dates as the card writes them.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CardMay } from "@/lib/admin/client-scope";
import { useA } from "../../../lang";
import type { TabKey } from "../card-fields";

export type Card = {
  id: string;
  tz: string;
  /**
   * A form says whether it has changes that are not saved. While any has,
   * leaving the card asks first; `reset` puts the form back as it is saved,
   * for when the answer is «leave».
   */
  guard: (key: string, dirty: boolean, reset?: () => void) => void;
  go: (tab: TabKey) => void;
  /** back to the list; asks first when something is not saved */
  close: () => void;
  /** back to the list without asking: this client is gone */
  gone: () => void;
  /** what the login may do on this card (its rights): a control it has no right to is not drawn */
  may: CardMay;
};

const Ctx = createContext<Card | null>(null);
export const CardProvider = Ctx.Provider;
export function useCard(): Card {
  const c = useContext(Ctx);
  if (!c) throw new Error("a card's tab outside its card");
  return c;
}

/** A form's «is it changed» for the card: tells the card, and takes the word back when the form goes. */
export function useGuard(key: string, dirty: boolean, reset: () => void) {
  const { guard } = useCard();
  useEffect(() => {
    guard(key, dirty, reset);
    return () => guard(key, false);
  }, [guard, key, dirty, reset]);
}

/**
 * Next keeps a card that was left, hidden, and shows it again as it was
 * when the same client is opened anew. What was typed should wait there;
 * a line about the last change («Сохранено», «в очереди») should not:
 * `forget` runs as the card is put away.
 */
export function useForgetOnLeave(forget: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => forget(), []);
}

/** Dates as the card writes them, in the salon's time. */
export function useFmt(tz: string) {
  const A = useA();
  return useMemo(() => {
    const long = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "numeric", month: "long", year: "numeric" });
    const longDay = new Intl.DateTimeFormat(A.intl, { timeZone: tz, weekday: "short", day: "numeric", month: "long", year: "numeric" });
    const short = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
    const time = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return {
      /** «14 марта 2024 г.» */
      long: (at: number) => long.format(at),
      /** «чт, 19 ноября 2026 г.» */
      longDay: (at: number) => longDay.format(at),
      /** «19.11.2026» */
      short: (at: number) => short.format(at),
      /** «14:05» */
      time: (at: number) => time.format(at),
      /** «19.11.2026, 14:05» */
      moment: (at: number) => `${short.format(at)}, ${time.format(at)}`,
    };
  }, [A.intl, tz]);
}

/**
 * A question before something that cannot be taken back. `onYes` returns
 * nothing when it is done (the question closes), a text when it did not
 * work (the question stays, to try again), or `{ refused }` when it cannot
 * be done at all: then only the way out is left.
 */
export function Ask({
  title,
  text,
  yes,
  no,
  onYes,
  onClose,
}: {
  title: string;
  text: string;
  yes: string;
  no?: string;
  onYes: () => Promise<string | { refused: string } | null | void> | string | { refused: string } | null | void;
  onClose: () => void;
}) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await onYes();
      if (r && typeof r === "object") setRefused(r.refused);
      else if (r) setErr(r);
      else onClose();
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {refused ? (
          <p role="alert">{refused}</p>
        ) : (
          <>
            <p>{text}</p>
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
            {refused ? A.close : (no ?? A.cancel)}
          </button>
          {!refused && (
            <button type="button" className="cc-btn cc-btn-main" disabled={busy} onClick={() => void go()}>
              {yes}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A switch with its words on the right: 42 × 24, yellow when on. */
export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="cc-switch">
      <input type="checkbox" role="switch" className="cc-sw" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A tick with its words; `note` says why it cannot be ticked. */
export function Tick({ checked, onChange, disabled, note, children }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <label className={`cc-check${disabled ? " is-off" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {children}
        {note && <small>{note}</small>}
      </span>
    </label>
  );
}

/** «Nothing here yet»: a pale circle with an icon and one line under it. */
export function Empty({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="cc-empty">
      <span aria-hidden="true">{children}</span>
      <p>{text}</p>
    </div>
  );
}
