"use client";

/**
 * The client booking flow in the look and the order of the Altegio widget
 * REMPIRE's clients know (Renat, 19.11.2026; Dim: Altegio's visuals, our
 * texts): 1 barber, 2 services, 3 day and time, 4 details, then «booked»
 * and a goodbye. Every step ends on one «Continue» at the bottom, as there.
 *
 *   /ru?b=<barber's slug>   opens with that barber picked, as the «book
 *                           now» buttons on rempire.ee do today.
 *   /ru/visit/<token>/move  moves that visit (its own page renders this
 *                           flow with `moving`): the day and time step
 *                           alone, same barber and services, then back to
 *                           the visit's page, as Altegio lets a client do.
 *
 * Free times come from /api/slots, special time included; «Book» posts to
 * /api/bookings with an Idempotency-Key. Screens: docs/client-flow.md and
 * the canvas https://claude.ai/artifact/5F78oNUN8bRrPQzoBcFLyr.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallOffer } from "./install-offer";
import { RemindMe } from "./remind-me";
import { CheckIcon, ChevronIcon, CrossIcon, DayIcon, InfoIcon, LogoMark, PencilIcon, PeopleIcon, StarIcon } from "@/components/brand";
import type { Catalog, CatalogStaff } from "@/lib/catalog";
import { COPY, duration, eur, euroRange, INTL, LOCALES, pick, type Locale } from "@/lib/i18n";
import { localParts } from "@/lib/tz";

type Props = {
  locale: Locale;
  catalog: Catalog;
  tz: string;
  horizonDays: number;
  /** 0 = a client moves or cancels at any time before the visit */
  cutoffHours: number;
  /** how long before the visit the SMS goes */
  reminderMin: number;
  demo: boolean;
  /** the key a phone subscribes with, when the salon offers the reminder as a notification; "" when not */
  pushKey: string;
  /** ?b=<slug>: the barber the link asked for */
  initialBarber: string | null;
  /** the visit being moved (/{locale}/visit/{token}/move); its barber and services stay */
  moving: Moving | null;
};

export type Moving = { token: string; staffId: string; services: string[]; start: number; url: string };

type Screen = "barber" | "services" | "time" | "details" | "done" | "bye";
/** [start ms, the barber «anyone» gets, his special-time extra in cents] */
type Tuple = [number, string, number?];
type Day = { d: string; open: boolean; s: Tuple[] };
type Avail = { key: string; offered: boolean; days: Day[] };
type Slot = { t: number; staffId: string; extra: number };
/** The visit this device booked, as remembered here and checked against the server (/api/visit/<token>). */
type NextVisit = { url: string; start: number; end: number; staffId: string; services: string[] };
type Done = { start: number; end: number; staffId: string; totalCents: number; extraCents: number; manageUrl: string | null };
type Sheet = { kind: "co" } | { kind: "lang" } | { kind: "barber"; id: string } | null;

const STORE = "rempire-booking:client";
// the last barber + services booked on this device: that barber is picked when the page opens
const LAST = "rempire-booking:last";
// the latest visit booked on this device: «Your visit» on the first screen opens its link
const VISIT = "rempire-booking:visit";
/** After «Add to calendar»: the goodbye, then the start again by itself (Renat, 19.11.2026). */
const BYE_MS = 7000;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateOf = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`);

export function BookingFlow({ locale, catalog, tz, horizonDays, cutoffHours, reminderMin, demo, pushKey, initialBarber, moving }: Props) {
  const [lang, setLang] = useState<Locale>(locale);
  const c = COPY[lang];
  const asked = useMemo(() => catalog.staff.find((s) => s.slug === initialBarber)?.id ?? null, [catalog.staff, initialBarber]);
  const [screen, setScreen] = useState<Screen>(moving ? "time" : "barber");
  const [barber, setBarber] = useState<string | null>(moving ? moving.staffId : asked); // staff id, "any", or null
  const [services, setServices] = useState<string[]>(moving ? moving.services : []);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availError, setAvailError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "+372 ", email: "", comment: "" });
  const [sms, setSms] = useState(true);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [taken, setTaken] = useState<Tuple[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [mine, setMine] = useState<string | null>(null); // the latest visit's own link
  const [next, setNext] = useState<NextVisit | null>(null); // that visit itself: «Ваш визит» on the first screen
  const [calMonth, setCalMonth] = useState<string | null>(null); // "YYYY-MM" the calendar shows
  const [monthOpen, setMonthOpen] = useState(true); // the whole month, or the chosen day's week alone
  const [closed, setClosed] = useState<Record<string, boolean>>({}); // «Morning» and the like, folded
  const [sheet, setSheet] = useState<Sheet>(null);
  const key = useRef("");
  const byeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staffById = useMemo(() => new Map(catalog.staff.map((s) => [s.id, s])), [catalog.staff]);
  const svcById = useMemo(() => new Map(catalog.services.map((s) => [s.id, s])), [catalog.services]);
  const can = useCallback((b: CatalogStaff, ids: string[]) => ids.every((id) => b.offers[id]), []);
  const priceOf = (b: CatalogStaff, ids: string[]) => ids.reduce((a, id) => a + (b.offers[id]?.[0] ?? 0), 0);
  const durOf = (b: CatalogStaff | null, ids: string[]) =>
    ids.reduce((a, id) => a + (b?.offers[id]?.[1] ?? svcById.get(id)?.durationMin ?? 0), 0);
  const capable = (ids: string[]) => catalog.staff.filter((b) => can(b, ids));

  // a returning client on this device
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved.name === "string" && typeof saved.phone === "string") {
        setForm((f) => ({ ...f, name: saved.name, phone: saved.phone, email: typeof saved.email === "string" ? saved.email : "" }));
        setRemembered(true);
      }
      // the barber of last time, unless the link asked for one
      const l = JSON.parse(localStorage.getItem(LAST) || "null");
      if (!asked && !moving && l && typeof l.barber === "string" && (l.barber === "any" || staffById.has(l.barber))) setBarber((b) => b ?? l.barber);
      // until the visit is over
      const v = JSON.parse(localStorage.getItem(VISIT) || "null");
      if (v && typeof v.url === "string" && /^\/(ru|et|en)\/visit\/[A-Za-z0-9_-]+$/.test(v.url) && typeof v.end === "number" && v.end > Date.now()) {
        setMine(v.url);
        if (typeof v.start === "number" && typeof v.staffId === "string" && Array.isArray(v.services)) {
          setNext({ url: v.url, start: v.start, end: v.end, staffId: v.staffId, services: v.services.filter((id: unknown): id is string => typeof id === "string") });
        }
        // as it stands now: moved or cancelled since, maybe on another device
        const url: string = v.url;
        fetch(`/api/visit/${url.split("/").pop()}`, { cache: "no-store" })
          .then((r) => (r.status === 404 ? { status: "cancelled" } : r.ok ? r.json() : null))
          .then((j) => {
            if (!j) return;
            const end = Date.parse(j.endsAt);
            if (["cancelled", "no_show", "done"].includes(j.status) || !(end > Date.now())) {
              setMine(null);
              setNext(null);
              localStorage.removeItem(VISIT);
              return;
            }
            const now: NextVisit = { url, start: Date.parse(j.startsAt), end, staffId: String(j.staffId), services: Array.isArray(j.serviceIds) ? j.serviceIds.map(String) : [] };
            setNext(now);
            localStorage.setItem(VISIT, JSON.stringify(now));
          })
          .catch(() => {
            /* offline: what the device remembers stays */
          });
      }
    } catch {
      /* private mode: nothing remembered */
    }
    // once, on arrival: the catalog does not change under the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => () => void (byeTimer.current && clearTimeout(byeTimer.current)), []);

  // an open sheet: the page under it stays put, Escape closes it
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet]);

  // free times for the current choice, the whole horizon at once
  const availKey = barber && services.length ? `${barber}|${services.join(",")}` : "";
  const wantsTimes = screen === "time" || screen === "details";
  useEffect(() => {
    if (!availKey || !wantsTimes || avail?.key === availKey) return;
    const ctl = new AbortController();
    setAvailError(false);
    const [staff, ids] = availKey.split("|");
    // a visit being moved asks by its own link: it does not stand in its own way
    fetch(moving ? `/api/visit/${moving.token}/slots?days=${horizonDays}` : `/api/slots?services=${ids}&staff=${staff}&days=${horizonDays}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { offered: boolean; days: Day[] }) => setAvail({ key: availKey, offered: j.offered, days: j.days }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setAvailError(true);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availKey, wantsTimes, avail?.key, horizonDays]);

  const ready = avail && avail.key === availKey ? avail : null;
  const earliest = useMemo(() => ready?.days.find((d) => d.s.length)?.d ?? null, [ready]);
  const shownDay = day ?? earliest ?? ready?.days[0]?.d ?? null;

  /* ---------- formatting ---------- */
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(INTL[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(ms);
  const wd = (d: string) => new Intl.DateTimeFormat(INTL[lang], { weekday: "short", timeZone: "UTC" }).format(dateOf(d)).replace(".", "");
  const dLong = (d: string) =>
    new Intl.DateTimeFormat(INTL[lang], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateOf(d));

  /* ---------- who and how much ---------- */
  // a picked time names the barber only from the details on
  const late = screen === "details" || screen === "done" || screen === "bye";
  const slotStaff = slot && late ? staffById.get(slot.staffId) ?? null : null;
  const assigned = slotStaff ?? (barber && barber !== "any" ? staffById.get(barber) ?? null : null);
  const extra = slotStaff ? slot?.extra ?? 0 : 0;
  const base = assigned ? priceOf(assigned, services) : 0;
  const who = () => {
    if (slotStaff && barber === "any") return `${slotStaff.name} (${c.firstFree})`;
    if (barber === "any") return c.anyBarber;
    return assigned?.name ?? "";
  };
  const priceNow = () => (assigned ? eur(base + extra) : euroRange(capable(services).map((b) => priceOf(b, services))));
  const names = (ids: string[]) => ids.map((id) => pick(svcById.get(id)?.name, lang)).join(" + ");

  /* ---------- actions ---------- */
  const resetTime = () => {
    setDay(null);
    setSlot(null);
    setTaken(null);
    setCalMonth(null);
  };

  const switchLang = (l: Locale) => {
    setLang(l);
    setSheet(null);
    document.documentElement.lang = l;
    const rest = window.location.pathname.split("/").slice(2).join("/");
    window.history.replaceState(null, "", `/${l}${rest ? `/${rest}` : ""}${window.location.search}`);
  };

  // another barber: the services he does not do drop out, and the times start over
  const pickBarber = (v: string) => {
    if (v === barber) return;
    resetTime();
    setBarber(v);
    if (v !== "any") {
      const b = staffById.get(v);
      setServices((s) => s.filter((id) => b?.offers[id]));
    }
  };

  const toggleService = (id: string) => {
    resetTime();
    setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const pickDay = (d: string) => {
    setDay(d);
    setSlot(null);
    setTaken(null);
    setCalMonth(d.slice(0, 7));
  };

  const pickSlot = (d: string, [t, staffId, x = 0]: Tuple) => {
    setDay(d);
    setSlot({ t, staffId, extra: x });
    setTaken(null);
    setFormError("");
    key.current = newKey();
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !slot || taken) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = c.errName;
    if (form.phone.replace(/\D/g, "").length < 7) errs.phone = c.errPhone;
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = c.errEmail;
    if (!consent) errs.consent = c.errConsent;
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({
          serviceIds: services,
          staffId: barber === "any" ? null : barber,
          startsAt: new Date(slot.t).toISOString(),
          // the price the client saw: the server books it or says the time is gone
          extraCents: slot.extra,
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          comment: form.comment || null,
          locale: lang,
          smsReminder: sms,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.visit) {
        const start = Date.parse(j.visit.startsAt);
        const end = Date.parse(j.visit.endsAt);
        try {
          localStorage.setItem(STORE, JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }));
          if (barber) localStorage.setItem(LAST, JSON.stringify({ barber, services }));
          if (j.manageUrl) localStorage.setItem(VISIT, JSON.stringify({ url: j.manageUrl, start, end, staffId: j.visit.staffId, services }));
        } catch {
          /* not remembered: fine */
        }
        if (j.manageUrl) {
          setMine(j.manageUrl);
          setNext({ url: j.manageUrl, start, end, staffId: j.visit.staffId, services });
        }
        setDone({ start, end, staffId: j.visit.staffId, totalCents: j.visit.totalCents, extraCents: j.visit.extraCents ?? 0, manageUrl: j.manageUrl });
        setSlot({ t: start, staffId: j.visit.staffId, extra: j.visit.extraCents ?? 0 });
        setAvail(null); // the chair is taken now
        setScreen("done");
      } else if (res.status === 409 && j.error === "slot_taken") {
        setTaken(j.alternatives ?? []);
        setAvail(null);
      } else if (res.status === 422 && j.field && ["name", "phone", "email"].includes(j.field)) {
        setErrors({ [j.field]: j.field === "name" ? c.errName : j.field === "phone" ? c.errPhone : c.errEmail });
      } else {
        setFormError(c.errGeneric);
      }
    } catch {
      setFormError(c.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  // the visit moves to the picked time; then its own page says so
  const moveVisit = async () => {
    if (!moving || !slot || moveBusy) return;
    setMoveBusy(true);
    setMoveError("");
    try {
      const res = await fetch(`/api/visit/${moving.token}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: new Date(slot.t).toISOString(), extraCents: slot.extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          const v = JSON.parse(localStorage.getItem(VISIT) || "null");
          if (v && typeof v.url === "string" && j.startsAt && j.endsAt) localStorage.setItem(VISIT, JSON.stringify({ ...v, start: Date.parse(j.startsAt), end: Date.parse(j.endsAt) }));
        } catch {
          /* not remembered: the visit's page knows */
        }
        window.location.assign(`${moving.url.replace(/^\/(ru|et|en)\//, `/${lang}/`)}?moved=1`);
        return;
      }
      if (res.status === 409 && j.error === "slot_taken") {
        setSlot(null);
        setAvail(null);
        setMoveError(c.taken);
      } else if (res.status === 409 || res.status === 404) {
        setMoveError(c.moveGone);
      } else {
        setMoveError(c.errGeneric);
      }
    } catch {
      setMoveError(c.errGeneric);
    }
    setMoveBusy(false);
  };

  // «Book again»: the same barber and services, another time
  const again = () => {
    resetTime();
    setDone(null);
    setRemembered(true);
    setScreen("time");
  };

  // the start, as a client who just arrived: the visit just booked is on it
  const home = () => {
    if (byeTimer.current) clearTimeout(byeTimer.current);
    byeTimer.current = null;
    resetTime();
    setDone(null);
    setServices([]);
    setRemembered(true);
    setScreen("barber");
  };

  // the calendar file opens or downloads; then the goodbye, and the start again by itself
  const addedToCalendar = () => {
    if (byeTimer.current) clearTimeout(byeTimer.current);
    byeTimer.current = setTimeout(() => {
      setScreen("bye");
      byeTimer.current = setTimeout(home, BYE_MS);
    }, 700);
  };

  /* ---------- pieces ---------- */
  const face = (s: CatalogStaff) =>
    // eslint-disable-next-line @next/next/no-img-element
    s.photoUrl ? <img src={s.photoUrl} alt="" width={96} height={96} decoding="async" /> : s.name.slice(0, 2).toUpperCase();
  const myLink = mine ? mine.replace(/^\/(ru|et|en)\//, `/${lang}/`) : null;
  const roleOf = (s: CatalogStaff) => pick(s.role, lang) || c.barberK;

  const stars = (s: CatalogStaff) =>
    s.rating == null ? null : (
      <span className="stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} on={n <= Math.round(s.rating ?? 0)} />
        ))}
        <span className="tiny">{c.nReviews(s.reviewCount)}</span>
      </span>
    );

  const langBtn = (
    <button type="button" className="rbtn" aria-label={`${c.lang}: ${lang.toUpperCase()}`} onClick={() => setSheet({ kind: "lang" })}>
      {lang.toUpperCase()}
    </button>
  );

  const header = (back?: () => void) => (
    <header className="hd">
      {back ? (
        <button type="button" className="rbtn" aria-label={c.back} onClick={back}>
          <ChevronIcon dir="left" />
        </button>
      ) : (
        <span className="hd-gap" />
      )}
      <LogoMark />
      <button type="button" className="hd-co" onClick={() => setSheet({ kind: "co" })}>
        <b>
          {catalog.business.name}
          <ChevronIcon size={20} />
        </b>
        <span className="sub">{catalog.location.address}</span>
      </button>
      {langBtn}
    </header>
  );

  const cta = (label: React.ReactNode, onClick: () => void, disabled = false) => (
    <div className="cta">
      <div className="cta-in">
        {/* a new button per screen: reusing one would let a tap on «Continue» land on the next screen's button */}
        <button key={`go-${screen}`} type="button" className="btn btn-primary" disabled={disabled} onClick={onClick}>
          {label}
        </button>
      </div>
    </div>
  );

  /** The visit as chosen or as booked: who, when, what, how much. Pencils only while it can still change. */
  const summary = (edit: boolean) => {
    if (!slot) return null;
    const start = done?.start ?? slot.t;
    const mins = done ? Math.round((done.end - done.start) / 60_000) : durOf(assigned, services);
    const end = done?.end ?? start + mins * 60_000;
    const x = done?.extraCents ?? extra;
    return (
      <>
        <div className="sum-row">
          <span className="ava">{assigned ? face(assigned) : <PeopleIcon />}</span>
          <span className="cell-txt">
            <span>{who()}</span>
            <span className="sub">{assigned ? roleOf(assigned) : c.anyRole}</span>
          </span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editBarber} onClick={() => setScreen("barber")}>
              <PencilIcon />
            </button>
          )}
        </div>
        <div className="sum-row">
          <span className="sum-ico">
            <DayIcon />
          </span>
          <span className="cell-txt">
            <span className="sub">{cap(dLong(localParts(start, tz).date))}</span>
            <span>
              {fmtTime(start)} — {fmtTime(end)}
            </span>
          </span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editTime} onClick={() => setScreen("time")}>
              <PencilIcon />
            </button>
          )}
        </div>
        <div className="sum-h">
          <h2 className="t2">{c.services}</h2>
          <span className="sub">{duration(mins, c)}</span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editServices} onClick={() => setScreen("services")}>
              <PencilIcon />
            </button>
          )}
        </div>
        {services.map((id) => (
          <div className="sum-svc" key={id}>
            <span>
              <span>{pick(svcById.get(id)?.name, lang)}</span>
              <span className="sub">{duration(assigned?.offers[id]?.[1] ?? svcById.get(id)?.durationMin ?? 0, c)}</span>
            </span>
            <b>{assigned ? eur(assigned.offers[id]?.[0] ?? 0) : ""}</b>
          </div>
        ))}
        {x > 0 && (
          <div className="sum-svc">
            <span>{c.special}</span>
            <b>+{eur(x)}</b>
          </div>
        )}
        <div className="sum-total">
          <span>{c.total}</span>
          <span>{eur(done?.totalCents ?? base + x)}</span>
        </div>
      </>
    );
  };

  // one free time; on special time its extra is on the chip
  const slotBtn = (d: string, x: Tuple) => {
    const [t, , add = 0] = x;
    return (
      <button
        key={t}
        type="button"
        className="slot"
        // the time the visit has now is no move
        disabled={moving?.start === t}
        aria-pressed={slot?.t === t}
        aria-label={add > 0 ? `${fmtTime(t)}, ${c.special}, +${eur(add)}` : undefined}
        onClick={() => pickSlot(d, x)}
      >
        <span>{fmtTime(t)}</span>
        {add > 0 && <small>+{eur(add)}</small>}
      </button>
    );
  };

  /* ---------- screens ---------- */
  /** The visit this device booked and still has ahead: when, with whom, and the way to change it. */
  const nextVisit = () => {
    if (!next || !myLink) return null;
    const what = [staffById.get(next.staffId)?.name, names(next.services.filter((id) => svcById.has(id)))].filter(Boolean).join(", ");
    return (
      <a className="next" href={myLink}>
        <span className="tiny">{c.yourVisit}</span>
        <b>
          {cap(dLong(localParts(next.start, tz).date))}, {fmtTime(next.start)}
        </b>
        {what && <span className="sub">{what}</span>}
        <span className="lk">{c.changeCancel}</span>
      </a>
    );
  };

  const barberScreen = () => (
    <>
      <div className="hero">
        {langBtn}
        <div className="hero-panel">
          <LogoMark size={80} />
          <h1 className="t1">
            <button type="button" className="hero-co" onClick={() => setSheet({ kind: "co" })}>
              {catalog.business.name}
              <ChevronIcon width={2.4} />
            </button>
          </h1>
          <p className="sub">{catalog.location.address}</p>
        </div>
      </div>
      {nextVisit()}
      <div className="cells" role="radiogroup" aria-label={c.barber}>
        <div className="cell">
          <button type="button" className="cell-main mid" role="radio" aria-checked={barber === "any"} onClick={() => pickBarber("any")}>
            <span className="ava">
              <PeopleIcon />
            </span>
            <span>{c.anyBarber}</span>
            <span className="radio" />
          </button>
        </div>
        {catalog.staff.map((s) => {
          const bio = pick(s.bio, lang);
          return (
            <div key={s.id} className={`cell${bio ? " has-info" : ""}`}>
              <button
                type="button"
                className="cell-main"
                role="radio"
                aria-checked={barber === s.id}
                aria-label={s.rating != null ? `${s.name}, ${roleOf(s)}, ${s.rating}, ${c.nReviews(s.reviewCount)}` : `${s.name}, ${roleOf(s)}`}
                onClick={() => pickBarber(s.id)}
              >
                <span className="ava">{face(s)}</span>
                <span className="cell-txt">
                  <span>{s.name}</span>
                  <span className="sub">{roleOf(s)}</span>
                  {stars(s)}
                </span>
                <span className="radio" />
              </button>
              {bio && (
                <button type="button" className="info-btn" aria-label={c.about(s.name)} onClick={() => setSheet({ kind: "barber", id: s.id })}>
                  <span>
                    <InfoIcon />
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const servicesScreen = () => {
    const b = barber && barber !== "any" ? staffById.get(barber) ?? null : null;
    const list = b ? catalog.services.filter((s) => b.offers[s.id]) : catalog.services.filter((s) => catalog.staff.some((x) => x.offers[s.id]));
    return (
      <>
        <h1 className="t1 pg-title">{c.chooseServices}</h1>
        <div className="svcs">
          {list.map((s) => {
            const on = services.includes(s.id);
            // «anyone»: a service nobody does together with the ones picked cannot be added
            const possible = on || !!b || capable([...services, s.id]).length > 0;
            const price = b ? eur(b.offers[s.id][0]) : euroRange(catalog.staff.filter((x) => x.offers[s.id]).map((x) => x.offers[s.id][0]));
            return (
              <button key={s.id} type="button" className="svc" role="checkbox" aria-checked={on} disabled={!possible} onClick={() => toggleService(s.id)}>
                <span className="svc-txt">
                  <span>{pick(s.name, lang)}</span>
                  <span className="sub">{duration(b ? b.offers[s.id][1] : s.durationMin, c)}</span>
                  <span className="svc-price">{price}</span>
                </span>
                <span className="check">
                  <CheckIcon size={14} width={3.2} />
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const basket = () => (
    <div className="basket">
      <div className="basket-in">
        <div className="basket-row">
          <span>{c.nServices(services.length)}</span>
          <span className="tiny">{duration(durOf(assigned, services), c)}</span>
          <span className="pr">{priceNow()}</span>
        </div>
        <button key="go-services" type="button" className="btn btn-primary" onClick={() => setScreen("time")}>
          {c.cont}
          <span className="badge">{services.length}</span>
        </button>
      </div>
    </div>
  );

  const timeScreen = () => {
    if (availError) return <p className="alert stack">{c.errGeneric}</p>;
    if (!ready) {
      return (
        <p className="wait" role="status">
          {c.loading}
        </p>
      );
    }
    if (!earliest) {
      const name = barber && barber !== "any" ? staffById.get(barber)?.name ?? "" : catalog.business.name;
      return (
        <div className="empty">
          <p className="t2">{c.noneAhead(name, horizonDays)}</p>
          {barber !== "any" && (
            <button type="button" className="btn btn-primary" onClick={() => pickBarber("any")}>
              {c.anyoneInstead}
            </button>
          )}
          {catalog.location.phone && (
            <a className="btn btn-soft" href={`tel:${catalog.location.phone.replace(/\s/g, "")}`}>
              {c.callSalon}
            </a>
          )}
        </div>
      );
    }
    const byDate = new Map(ready.days.map((d) => [d.d, d]));
    const current = byDate.get(shownDay ?? "") ?? ready.days[0];
    const today = localParts(Date.now(), tz).date;

    // the month, Monday first, with the days around it that fill its weeks
    const months = [...new Set(ready.days.map((d) => d.d.slice(0, 7)))];
    const month = calMonth && months.includes(calMonth) ? calMonth : current.d.slice(0, 7);
    const mi = months.indexOf(month);
    const [cy, cm] = month.split("-").map(Number);
    const first = Date.UTC(cy, cm - 1, 1);
    const lead = (new Date(first).getUTCDay() + 6) % 7;
    const inMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
    const rows = Math.ceil((lead + inMonth) / 7);
    const cells = Array.from({ length: rows * 7 }, (_, i) => ymd(first + (i - lead) * 86_400_000));
    const at = cells.indexOf(current.d);
    const shown = monthOpen ? cells : cells.slice(at < 0 ? 0 : at - (at % 7), (at < 0 ? 0 : at - (at % 7)) + 7);
    const wdNames = Array.from({ length: 7 }, (_, i) => wd(`2024-01-0${i + 1}`)); // 01.01.2024 was a Monday

    let body: React.ReactNode;
    if (!current.s.length) {
      const nextDay = ready.days.find((d) => d.d > current.d && d.s.length) ?? byDate.get(earliest);
      body = (
        <div className="empty">
          <p className="t2">{current.open ? c.noTimeDay : c.closedDay}</p>
          {nextDay && nextDay.d !== current.d && (
            <>
              <p>
                {c.nextDate}
                <br />
                {cap(dLong(nextDay.d))}
              </p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => pickDay(nextDay.d)}>
                {c.toNearest}
              </button>
            </>
          )}
        </div>
      );
    } else {
      const groups: [string, string, (m: number) => boolean][] = [
        ["am", c.morning, (m) => m < 720],
        ["day", c.day, (m) => m >= 720 && m < 1020],
        ["pm", c.evening, (m) => m >= 1020],
      ];
      body = (
        <div className="groups">
          {groups.map(([id, name, f]) => {
            const xs = current.s.filter(([t]) => f(localParts(t, tz).minutes));
            if (!xs.length) return null;
            const open = !closed[id];
            return (
              <section className="grp" key={id}>
                <button type="button" className="grp-h" aria-expanded={open} onClick={() => setClosed((v) => ({ ...v, [id]: open }))}>
                  <span>{name}</span>
                  <ChevronIcon dir={open ? "up" : "down"} />
                </button>
                {open && <div className="slots">{xs.map((x) => slotBtn(current.d, x))}</div>}
              </section>
            );
          })}
          {current.s.some((x) => (x[2] ?? 0) > 0) && <p className="tiny legend">{c.specialNote}</p>}
        </div>
      );
    }

    return (
      <>
        {moving && (
          <div className="moving">
            <h1 className="t2">{c.movingTitle}</h1>
            <p className="sub">{c.movingNow(dLong(localParts(moving.start, tz).date), fmtTime(moving.start))}</p>
            {moveError && (
              <p className="alert" role="alert">
                {moveError}
              </p>
            )}
          </div>
        )}
        <div className="cal">
          <div className="cal-top">
            <button type="button" className="cal-month" aria-expanded={monthOpen} onClick={() => setMonthOpen((v) => !v)}>
              <span>
                {cap(new Intl.DateTimeFormat(INTL[lang], { month: "long", timeZone: "UTC" }).format(first))}
                <ChevronIcon dir={monthOpen ? "up" : "down"} size={16} width={2.4} />
              </span>
            </button>
            <button type="button" className="cal-nav" disabled={mi <= 0} aria-label={c.prevMonth} onClick={() => setCalMonth(months[mi - 1])}>
              <ChevronIcon dir="left" size={16} width={2.4} />
            </button>
            <button type="button" className="cal-nav" disabled={mi >= months.length - 1} aria-label={c.nextMonth} onClick={() => setCalMonth(months[mi + 1])}>
              <ChevronIcon dir="right" size={16} width={2.4} />
            </button>
          </div>
          <div className="cal-wd" aria-hidden="true">
            {wdNames.map((n) => (
              <span key={n}>{cap(n)}</span>
            ))}
          </div>
          <div className="cal-grid">
            {shown.map((d) => {
              const known = byDate.get(d);
              const free = !!known?.s.length;
              return (
                <button
                  key={d}
                  type="button"
                  className={`cal-d${free ? "" : " off"}${d === today ? " today" : ""}`}
                  disabled={!known}
                  aria-pressed={d === current.d}
                  aria-label={dLong(d)}
                  onClick={() => pickDay(d)}
                >
                  <span>{Number(d.slice(8, 10))}</span>
                </button>
              );
            })}
          </div>
        </div>
        {body}
      </>
    );
  };

  const field = (id: "name" | "phone" | "email" | "comment", label: string, input: React.ReactNode, hint?: string) => (
    <div className={`field${errors[id] ? " err" : ""}`}>
      <label className="flabel" htmlFor={`f-${id}`}>
        {label}
      </label>
      {input}
      {errors[id] ? <span className="ferr">{errors[id]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
  const onField = (id: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [id]: v }));
    if (errors[id]) setErrors(({ [id]: _drop, ...rest }) => rest);
  };

  const detailsScreen = () => {
    if (!slot) return null;
    return (
      <form id="bf" noValidate onSubmit={submit}>
        <div className="blk top">
          <h1 className="t1">{c.visitDetails}</h1>
          {summary(true)}
        </div>
        <div className="blk form">
          <h2 className="t2">{c.details}</h2>
          <div className="fields">
            {taken && (
              <div className="taken" role="alert">
                <h3>{c.taken}</h3>
                <p>{c.takenSub}</p>
                {taken.length > 0 && <div className="slots">{taken.map((x) => slotBtn(localParts(x[0], tz).date, x))}</div>}
              </div>
            )}
            {remembered && <p className="welcome">{c.welcome}</p>}
            {field(
              "name",
              `${c.name} *`,
              <input className="input" id="f-name" name="name" autoComplete="name" placeholder={c.enterName} value={form.name} onChange={onField("name")} maxLength={120} required />,
            )}
            {field(
              "phone",
              `${c.phone} *`,
              <input className="input" id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={onField("phone")} maxLength={30} required />,
            )}
            {field(
              "email",
              c.email,
              <input className="input" id="f-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={onField("email")} maxLength={254} />,
              c.emailHint,
            )}
            {field(
              "comment",
              c.commentLong,
              <input className="input" id="f-comment" name="comment" placeholder={c.commentHint} value={form.comment} onChange={onField("comment")} maxLength={1000} />,
            )}
            <label className="selrow">
              <span className="flabel">{c.reminder}</span>
              <select id="f-remind" value={sms ? "on" : "off"} onChange={(e) => setSms(e.target.value === "on")}>
                <option value="on">{c.remindAt(reminderMin)}</option>
                <option value="off">{c.remindNone}</option>
              </select>
              <ChevronIcon dir="right" />
            </label>
            <div className={`field${errors.consent ? " err" : ""}`}>
              <button
                type="button"
                id="f-consent"
                className="consent"
                role="checkbox"
                aria-checked={consent}
                onClick={() => {
                  setConsent((v) => !v);
                  if (errors.consent) setErrors(({ consent: _drop, ...rest }) => rest);
                }}
              >
                <span className="check">
                  <CheckIcon size={14} width={3.2} />
                </span>
                <span>{c.consent}</span>
              </button>
              {errors.consent && <span className="ferr">{errors.consent}</span>}
            </div>
            {formError && (
              <p className="alert" role="alert">
                {formError}
              </p>
            )}
          </div>
        </div>
        <div className="blk total-blk">
          <span>{c.total}</span>
          <span>{eur(base + extra)}</span>
        </div>
        <div className="foot">
          <button type="submit" className="btn btn-primary" disabled={submitting || !!taken}>
            {submitting ? c.booking : c.book}
          </button>
        </div>
      </form>
    );
  };

  const doneScreen = () => {
    if (!done) return null;
    const token = done.manageUrl?.split("/").pop();
    return (
      <>
        <div className="blk top">
          <div className="mark">
            <CheckIcon size={24} width={2.6} />
          </div>
          <h1 className="t1">{c.booked}</h1>
          <p className="lead">
            {c.seeYou(dLong(localParts(done.start, tz).date), fmtTime(done.start))} {sms ? c.smsAt(reminderMin) : ""}
          </p>
          {summary(false)}
        </div>
        <div className="blk btns">
          {token && (
            <a className="btn btn-primary" href={`/api/ics/${token}?lang=${lang}`} onClick={addedToCalendar}>
              {c.addCal}
            </a>
          )}
          {done.manageUrl && (
            <a className="btn btn-soft" href={done.manageUrl.replace(/^\/(ru|et|en)\//, `/${lang}/`)}>
              {c.changeCancel}
            </a>
          )}
          <button type="button" className="btn btn-text" onClick={again}>
            {c.again}
          </button>
          <p className="note">{cutoffHours > 0 ? c.cutoff(cutoffHours) : c.anyTime}</p>
        </div>
        {pushKey && token && <RemindMe token={token} publicKey={pushKey} c={c.remind} />}
        <InstallOffer c={c.install} />
        <div className="tail" />
      </>
    );
  };

  const byeScreen = () => (
    <div className="bye">
      <LogoMark size={80} />
      <h1 className="t1">{c.byeTitle(form.name.trim().split(/\s+/)[0] ?? "")}</h1>
      {done && <p>{c.seeYou(dLong(localParts(done.start, tz).date), fmtTime(done.start))}</p>}
      <p className="day">{c.goodDay}</p>
      <button type="button" className="btn btn-primary" onClick={home}>
        {c.home}
      </button>
      <p className="sub">{c.homeSoon}</p>
    </div>
  );

  const sheetView = () => {
    if (!sheet) return null;
    const b = sheet.kind === "barber" ? staffById.get(sheet.id) ?? null : null;
    const close = () => setSheet(null);
    const tel = catalog.location.phone.replace(/\s/g, "");
    return (
      <div className="sheet-wrap">
        <button type="button" className="sheet-scrim" aria-label={c.close} tabIndex={-1} onClick={close} />
        <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === "co" ? catalog.business.name : sheet.kind === "lang" ? c.lang : b?.name}>
          <button type="button" className="sheet-x" aria-label={c.close} autoFocus onClick={close}>
            <span>
              <CrossIcon size={16} />
            </span>
          </button>
          {sheet.kind === "co" && (
            <>
              <h2 className="t2">{catalog.business.name}</h2>
              <div className="kvs">
                {catalog.location.address && (
                  <div>
                    <span className="tiny">{c.addressK}</span>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(catalog.location.address)}`} target="_blank" rel="noreferrer">
                      {catalog.location.address}
                    </a>
                  </div>
                )}
                {tel && (
                  <div>
                    <span className="tiny">{c.phone}</span>
                    <a href={`tel:${tel}`}>{catalog.location.phone}</a>
                  </div>
                )}
              </div>
            </>
          )}
          {sheet.kind === "lang" && (
            <>
              <h2 className="t2">{c.lang}</h2>
              <div className="opts">
                {LOCALES.map((l) => (
                  <button key={l} type="button" className="opt" lang={l} aria-pressed={lang === l} onClick={() => switchLang(l)}>
                    {l === "ru" ? "Русский" : l === "et" ? "Eesti" : "English"}
                    {lang === l && <CheckIcon size={20} width={2.6} />}
                  </button>
                ))}
              </div>
            </>
          )}
          {b && (
            <>
              <div className="sheet-head">
                <span className="ava big">{face(b)}</span>
                <span className="cell-txt">
                  <h2 className="t2">{b.name}</h2>
                  <span className="sub">{roleOf(b)}</span>
                  {stars(b)}
                </span>
              </div>
              <p>{pick(b.bio, lang)}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  pickBarber(b.id);
                  close();
                }}
              >
                {c.pickThis}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const ground = screen === "details" || screen === "done";
  const timePicked = !!slot && !!ready && localParts(slot.t, tz).date === (shownDay ?? "");
  const hasCta = screen === "barber" || (screen === "time" && timePicked);
  const hasBasket = screen === "services" && services.length > 0;
  return (
    <>
      <main className={`app${ground ? " ground" : ""}${hasCta ? " has-cta" : ""}${hasBasket ? " has-basket" : ""}`} aria-live="polite">
        {demo && screen !== "bye" && <p className="demo">{c.demo}</p>}
        {screen === "barber" && barberScreen()}
        {screen === "services" && (
          <>
            {header(() => setScreen("barber"))}
            {servicesScreen()}
          </>
        )}
        {screen === "time" && (
          <>
            {header(moving ? () => window.location.assign(moving.url.replace(/^\/(ru|et|en)\//, `/${lang}/`)) : () => setScreen("services"))}
            {timeScreen()}
          </>
        )}
        {screen === "details" && (
          <>
            {header(() => setScreen("time"))}
            {detailsScreen()}
          </>
        )}
        {screen === "done" && (
          <>
            {header()}
            {doneScreen()}
          </>
        )}
        {screen === "bye" && byeScreen()}
      </main>
      {screen === "barber" && cta(c.cont, () => setScreen("services"), !barber)}
      {hasBasket && basket()}
      {screen === "time" && timePicked && (moving ? cta(moveBusy ? c.movingBusy : c.moveHere, moveVisit, moveBusy) : cta(c.cont, () => setScreen("details")))}
      {sheetView()}
    </>
  );
}
