"use client";

/**
 * What the calendar's sheets (calendar.tsx), the visit window
 * (visit-window.tsx) and the new visit (new-visit.tsx) share: what the login
 * may do, the pickers of a barber and of services, the line above the main
 * button, a few formats, and the parts of the window from 900px: its frame,
 * the status chips, the tiles and their panel, and the service cards.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import type { CalendarData, CalMay, CalService } from "@/lib/admin/calendar";
import { eur } from "../copy";
import { Ava, NextIcon, TickIcon } from "../icons";
import { useA } from "../lang";
import { euro } from "./journal-bar";

export const fmt = (intl: string, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intl, { timeZone: tz, ...o });
export const timeOf = (tz: string, ms: number) => fmt("ru-RU", tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
/** The local day of a moment, YYYY-MM-DD. */
export const dayOf = (tz: string, ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «HH:MM» as minutes of the day; NaN for anything else. */
export const minutesOf = (hm: string) => (/^\d{2}:\d{2}$/.test(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : NaN);
export const MIN = 60_000;
/** The client has come: «arrived» (in the chair) or «done». */
export const CAME = new Set(["arrived", "done"]);

/** What this login may do in the calendar, for the sheets and the window. */
const May = createContext<CalMay>({ create: true, newClient: true, pickClient: true, edit: true, editCame: true, moveWindow: true, services: true, note: true, move: true, cancel: true, cancelCame: true, schedule: true, stats: true, sell: true, call: true, from: null });
export const MayProvider = May.Provider;
export const useMay = () => useContext(May);

/** The services a barber does, as the calendar's data has them. */
export const offered = (services: CalService[], staffId: string) => services.filter((s) => s.active && s.offers[staffId]);

export function StaffPicker({ data, value, onChange }: { data: CalendarData; value: string; onChange: (id: string) => void }) {
  const A = useA();
  return (
    <div className="adm-field">
      <span>{A.visit.barber}</span>
      <div className="adm-who" role="group" aria-label={A.visit.barber}>
        {data.staff
          .filter((s) => s.active)
          .map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === value} onClick={() => onChange(s.id)}>
              <Ava src={s.photoUrl} name={s.name} />
              <span>{s.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

export function ServicePicker({ services, staffId, picked, onChange }: { services: CalService[]; staffId: string; picked: string[]; onChange: (ids: string[]) => void }) {
  const A = useA();
  return (
    <div className="adm-svcs" role="group" aria-label={A.visit.services}>
      {offered(services, staffId).map((s) => {
        const on = picked.includes(s.id);
        const [price, minutes] = s.offers[staffId];
        return (
          <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}>
            <span className="bx">
              <TickIcon />
            </span>
            <span className="n">{A.pick(s.name)}</span>
            <small>
              {A.mins(minutes)} · {eur(price)}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** A barber's own minutes and price for these services. */
export function sumOf(services: CalService[], staffId: string, ids: string[]) {
  let m = 0;
  let c = 0;
  for (const id of ids) {
    const o = services.find((s) => s.id === id)?.offers[staffId];
    if (o) {
      c += o[0];
      m += o[1];
    }
  }
  return { minutes: m, cents: c };
}

/** A problem under the fields, or the «anyway» question, right above the main button. */
export function BarNote({ problem, warn }: { problem: string | null; warn: string | null }) {
  const text = warn ?? problem;
  if (!text) return null;
  return (
    <p className="adm-err" role="alert">
      {text}
    </p>
  );
}

/* ---------- the window from 900px: the visit's and the new one's ---------- */

/** The four chips: «Ожидание», «Клиент пришёл», «Не пришёл», «Подтвердил». */
export const CHIPS = ["booked", "arrived", "no_show", "confirmed"] as const;
export type Chip = (typeof CHIPS)[number];
/** The status and flag a chip writes. «Подтвердил» is a waiting visit with its flag (021_visit_confirmed.sql). */
export const CHIP: Record<Chip, [string, boolean]> = { booked: ["booked", false], confirmed: ["booked", true], arrived: ["arrived", false], no_show: ["no_show", false] };
/** The panels a tile on the left slides over the column. */
export type Tile = "fields" | "notify" | "log";
const TILE_ICON: Record<Tile, string> = {
  fields: "M5 7h14M5 12h14M5 17h8",
  notify: "M6 17V11a6 6 0 0112 0v6l1.5 2h-15zM10 21h4",
  log: "M12 7v5l3 2M4 12a8 8 0 108-8 8 8 0 00-6 3M4 4v4h4",
};
/** The service cards drawn before a search: his last visit's first. */
const CARDS = 6;

/** «Иван Петров» → «ИП». */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** The window's line icons: 24-unit paths at a size, in the text's colour. */
export const svg = (size: number) => ({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true }) as const;

const ChipIcon = ({ chip }: { chip: Chip }) => (
  <svg {...svg(14)} strokeWidth={2}>
    {chip === "booked" ? (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.8l3 1.8" />
      </>
    ) : chip === "arrived" ? (
      <path d="M12 6v12M6 12h12" />
    ) : chip === "no_show" ? (
      <path d="M6 12h12" />
    ) : (
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    )}
  </svg>
);

/**
 * The window's frame, as the board draws it: a drawer from the right over
 * the dimmed page, a round «›» on its seam, the columns, and a white 64px
 * foot with the title on the left and the buttons on the right. Escape, the
 * seam and the dark side close it without asking; `onEscape` may take the
 * key first (a menu that is open), and says so with true. The keyboard
 * starts inside the window and goes back to what opened it.
 */
export function VwFrame({
  label,
  title,
  lead,
  acts,
  onClose,
  onEscape,
  children,
}: {
  /** the dialog's name */
  label: string;
  /** the foot's title */
  title: string;
  /** what stands beside the title */
  lead?: React.ReactNode;
  /** the foot's buttons */
  acts: React.ReactNode;
  onClose: () => void;
  onEscape?: () => boolean;
  children: React.ReactNode;
}) {
  const A = useA();
  const box = useRef<HTMLDivElement>(null);
  const keys = useRef({ onClose, onEscape });
  useLayoutEffect(() => {
    keys.current = { onClose, onEscape };
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!keys.current.onEscape?.()) keys.current.onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useLayoutEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus();
    return () => {
      if (back?.isConnected) back.focus();
    };
  }, []);
  return (
    <div className="vw-wrap" onClick={onClose}>
      <div ref={box} className="vw" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vw-seam" aria-label={A.win.close} onClick={onClose}>
          <NextIcon size={16} />
        </button>
        <div className="vw-body">{children}</div>
        <footer className="vw-foot">
          <h2>{title}</h2>
          {lead}
          <div className="vw-acts">{acts}</div>
        </footer>
      </div>
    </div>
  );
}

/** The four chips, the chosen one dark. */
export function Chips({ current, disabled, onPick }: { current: Chip; disabled: (c: Chip) => boolean; onPick: (c: Chip) => void }) {
  const W = useA().win;
  return (
    <div className="vw-chips" role="group" aria-label={W.status}>
      {CHIPS.map((c) => (
        <button key={c} type="button" className="vw-chip" aria-pressed={current === c} disabled={disabled(c)} onClick={() => onPick(c)}>
          <ChipIcon chip={c} />
          {W.chips[c]}
        </button>
      ))}
    </div>
  );
}

/** The left column's tiles, two in a row, the icon over the words. */
export function Tiles({ tiles, open, onOpen }: { tiles: readonly Tile[]; open: Tile | null; onOpen: (t: Tile) => void }) {
  const W = useA().win;
  return (
    <div className="vw-tiles">
      {tiles.map((t) => (
        <button key={t} type="button" className="vw-tile" aria-expanded={open === t} onClick={() => onOpen(t)}>
          <svg {...svg(16)}>
            <path d={TILE_ICON[t]} />
          </svg>
          <span>{W.tiles[t]}</span>
        </button>
      ))}
    </div>
  );
}

/** A tile's panel over the left column; «Скрыть» gives the column back. */
export function Slide({ tile, onHide, children }: { tile: Tile; onHide: () => void; children: React.ReactNode }) {
  const W = useA().win;
  return (
    <div className="vw-slide" role="region" aria-label={W.tiles[tile]}>
      <div className="vw-slide-head">
        <h3>{W.tiles[tile]}</h3>
        <button type="button" className="vw-btn" onClick={onHide}>
          {W.hide}
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * «Поиск по услугам», the cards three in a row (the chosen ones with the
 * yellow line), and «Все услуги» → «Услуга ▾». Only the services this barber
 * does, at his price and length. With `last` (the client's last visit), its
 * services come first with the violet «Последний визит»; a new visit has no
 * such row.
 */
export function Cards({
  data,
  sid,
  picked,
  last,
  find,
  onFind,
  disabled,
  onToggle,
}: {
  data: CalendarData;
  sid: string;
  picked: string[];
  last?: string[];
  find: string;
  onFind: (s: string) => void;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const A = useA();
  const W = A.win;
  const all = offered(data.services, sid);
  const before = last ?? [];
  const q = find.trim().toLocaleLowerCase();
  // a search finds among all of his; without one, his last visit's first and a few more
  const cards = q ? all.filter((s) => A.pick(s.name).toLocaleLowerCase().includes(q)) : [...all.filter((s) => before.includes(s.id)), ...all.filter((s) => !before.includes(s.id))].slice(0, CARDS);
  return (
    <>
      <label className="vw-search">
        <span className="sr">{W.searchServices}</span>
        <input type="search" placeholder={W.searchServices} value={find} onChange={(e) => onFind(e.target.value)} />
      </label>
      {cards.length ? (
        <div className={`vw-cards${last ? "" : " no-tags"}`} role="group" aria-label={A.visit.services}>
          {cards.map((s) => {
            const [price, minutes] = s.offers[sid];
            return (
              <button key={s.id} type="button" className="vw-card" aria-pressed={picked.includes(s.id)} disabled={disabled} onClick={() => onToggle(s.id)}>
                <span className="n">{A.pick(s.name)}</span>
                {last && (
                  <span className="vw-tag" style={{ visibility: last.includes(s.id) ? "visible" : "hidden" }} aria-hidden={!last.includes(s.id)}>
                    {W.lastVisit}
                  </span>
                )}
                <span>{euro(price)}</span>
                <span className="vw-dim">{A.mins(minutes)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="vw-dim">{W.noServices}</p>
      )}
      {!disabled && (
        <>
          <p className="vw-dim">{W.allServices}</p>
          <select
            className="vw-pick"
            aria-label={W.allServices}
            value=""
            onChange={(e) => {
              if (e.target.value) onToggle(e.target.value);
            }}
          >
            <option value="">{W.pickService}</option>
            {all
              .filter((s) => !picked.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {A.pick(s.name)} · {euro(s.offers[sid][0])}
                </option>
              ))}
          </select>
        </>
      )}
    </>
  );
}
