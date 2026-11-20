"use client";

/**
 * What the calendar's sheets (calendar.tsx) and the visit window
 * (visit-window.tsx) share: what the login may do, the pickers of a barber
 * and of services, the line above the main button, and a few formats.
 */
import { createContext, useContext } from "react";
import type { CalendarData, CalMay, CalService } from "@/lib/admin/calendar";
import { eur } from "../copy";
import { Ava, TickIcon } from "../icons";
import { useA } from "../lang";

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
