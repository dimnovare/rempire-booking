"use client";

/**
 * The client booking flow, design v2 (Dim, 17.11.2026): 1 barber and
 * service, 2 time, 3 details, then done. One bar at the bottom, at every
 * width, holds the summary, the price and the one next step: «Choose a
 * time», «Same as last time», «Earliest», «Book». Tapping a time still goes
 * straight to the details. Free times come from /api/slots, special time
 * included; «Book» posts to /api/bookings with an Idempotency-Key.
 * Screens: docs/client-flow.md and the design v2 canvas
 * (https://claude.ai/artifact/Dg7tYCfjpba275Q5GWatFA).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallOffer } from "./install-offer";
import { RemindMe } from "./remind-me";
import { BackIcon, CalendarIcon, CheckIcon, Logo, PersonIcon, PlusIcon, TowerMark } from "@/components/brand";
import type { Catalog, CatalogStaff } from "@/lib/catalog";
import { COPY, duration, eur, euroRange, INTL, LOCALES, pick, type Locale } from "@/lib/i18n";
import { addDays, localParts } from "@/lib/tz";

type Props = {
  locale: Locale;
  catalog: Catalog;
  tz: string;
  horizonDays: number;
  cutoffHours: number;
  demo: boolean;
  /** the key a phone subscribes with, when the salon offers the reminder as a notification; "" when not */
  pushKey: string;
};

/** [start ms, the barber «anyone» gets, his special-time extra in cents] */
type Tuple = [number, string, number?];
type Day = { d: string; open: boolean; s: Tuple[] };
type Avail = { key: string; offered: boolean; days: Day[] };
type Slot = { t: number; staffId: string; extra: number };
/** The visit this device booked, as remembered here and checked against the server (/api/visit/<token>). */
type NextVisit = { url: string; start: number; end: number; staffId: string; services: string[] };
type Done = { start: number; end: number; staffId: string; totalCents: number; extraCents: number; manageUrl: string | null };

/** What the bottom bar shows: who and what, the price, and the one next step. */
type Bar = {
  back?: () => void;
  face?: CatalogStaff | "any" | null;
  kicker?: string;
  /** body text instead of the display face: a hint or a «same as last time» line */
  plain?: boolean;
  title: string;
  sub?: string;
  /** phones: title and sub when they differ (the price leads there) */
  mTitle?: string;
  mSub?: string;
  price?: string;
  go: { label: React.ReactNode; mLabel?: React.ReactNode; onClick?: () => void; disabled?: boolean; form?: string };
};

const STORE = "rempire-booking:client";
// the last barber + services booked on this device: «Same as last time» is one tap
const LAST = "rempire-booking:last";
// the latest visit booked on this device: «My visits» opens its link until A8
const VISIT = "rempire-booking:visit";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateOf = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`);

export function BookingFlow({ locale, catalog, tz, horizonDays, cutoffHours, demo, pushKey }: Props) {
  const [lang, setLang] = useState<Locale>(locale);
  const c = COPY[lang];
  const [screen, setScreen] = useState<1 | 2 | 3 | 4>(1);
  const [barber, setBarber] = useState<string | null>(null); // staff id, "any", or null
  const [services, setServices] = useState<string[]>([]);
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availError, setAvailError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "+372 ", email: "", comment: "" });
  const [sms, setSms] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [taken, setTaken] = useState<Tuple[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [last, setLast] = useState<{ barber: string; services: string[] } | null>(null);
  const [mine, setMine] = useState<string | null>(null); // the latest visit's own link
  const [next, setNext] = useState<NextVisit | null>(null); // that visit itself: «Ваша запись» on the first screen
  const [calMonth, setCalMonth] = useState<string | null>(null); // "YYYY-MM" the calendar shows
  const [calOpen, setCalOpen] = useState(false); // phones: the month instead of the strip
  const [showComment, setShowComment] = useState(false);
  const [more, setMore] = useState(false); // part of the screen is still under the bar
  const key = useRef("");
  const strip = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

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
      // only if that barber still does all of those services
      const l = JSON.parse(localStorage.getItem(LAST) || "null");
      if (l && typeof l.barber === "string" && Array.isArray(l.services) && l.services.length) {
        const ids = l.services.filter((id: unknown): id is string => typeof id === "string" && svcById.has(id));
        const b = l.barber === "any" ? null : staffById.get(l.barber);
        const ok = ids.length === l.services.length && (l.barber === "any" ? capable(ids).length > 0 : !!b && can(b, ids));
        if (ok) setLast({ barber: l.barber, services: ids });
      }
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

  // «More below» while the end of the screen is still hidden under the bar,
  // so nobody takes the bar for the end of the page (Dim, 17.11.2026)
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bar = document.querySelector(".bar");
        const el = end.current;
        setMore(!!bar && !!el && el.getBoundingClientRect().top > bar.getBoundingClientRect().top + 1);
      });
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // the page grows and shrinks as screens change and fields open
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro?.disconnect();
    };
  }, []);

  // free times for the current choice, the whole horizon at once
  const availKey = barber && services.length ? `${barber}|${services.join(",")}` : "";
  useEffect(() => {
    if (!availKey || screen < 2 || avail?.key === availKey) return;
    const ctl = new AbortController();
    setAvailError(false);
    const [staff, ids] = availKey.split("|");
    fetch(`/api/slots?services=${ids}&staff=${staff}&days=${horizonDays}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { offered: boolean; days: Day[] }) => setAvail({ key: availKey, offered: j.offered, days: j.days }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setAvailError(true);
      });
    return () => ctl.abort();
  }, [availKey, screen, avail?.key, horizonDays]);

  const ready = avail && avail.key === availKey ? avail : null;
  const earliest = useMemo(() => {
    if (!ready) return null;
    for (const d of ready.days) if (d.s.length) return { d: d.d, t: d.s[0][0], staffId: d.s[0][1], extra: d.s[0][2] ?? 0 };
    return null;
  }, [ready]);
  const shownDay = day ?? earliest?.d ?? ready?.days[0]?.d ?? null;

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('.day[aria-pressed="true"]');
    const box = strip.current;
    if (el && box) box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
  }, [shownDay, screen, ready, calOpen]);

  /* ---------- formatting ---------- */
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(INTL[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(ms);
  const wd = (d: string) => new Intl.DateTimeFormat(INTL[lang], { weekday: "short", timeZone: "UTC" }).format(dateOf(d)).replace(".", "");
  const dd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const dShort = (d: string) => `${cap(wd(d))} ${dd(d)}`;
  const dLong = (d: string) =>
    new Intl.DateTimeFormat(INTL[lang], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateOf(d));
  // «today», «tomorrow», else «Wed 18.11»; only on screens that ran in the browser
  const rel = (d: string) => {
    const today = localParts(Date.now(), tz).date;
    return d === today ? c.today : d === addDays(today, 1) ? c.tomorrow : dShort(d);
  };

  /* ---------- who and how much ---------- */
  // a picked time counts only from the details on: back on steps 1–2 the
  // bar shows the choice being made, not the time picked before
  const slotStaff = slot && screen >= 3 ? staffById.get(slot.staffId) ?? null : null;
  const assigned = slotStaff ?? (barber && barber !== "any" ? staffById.get(barber) ?? null : null);
  const extra = slotStaff ? slot?.extra ?? 0 : 0;
  const base = assigned ? priceOf(assigned, services) : 0;
  const who = () => {
    if (slotStaff && barber === "any") return `${slotStaff.name} (${c.firstFree})`;
    if (barber === "any") return c.anyone;
    return assigned?.name ?? "";
  };
  const priceNow = () => (assigned ? eur(base + extra) : euroRange(capable(services).map((b) => priceOf(b, services))));
  const durNow = () => durOf(assigned, services);
  const names = (ids: string[]) => ids.map((id) => pick(svcById.get(id)?.name, lang)).join(" + ");
  /** the full price at one free time: that barber's price plus the time's extra */
  const priceAt = (staffId: string, x: number) => {
    const b = staffById.get(staffId);
    return b ? eur(priceOf(b, services) + x) : "";
  };

  /* ---------- actions ---------- */
  const go = (n: 1 | 2 | 3 | 4) => setScreen(n);
  const resetTime = () => {
    setDay(null);
    setSlot(null);
    setTaken(null);
    setCalMonth(null);
    setCalOpen(false);
  };
  const toTimes = () => {
    resetTime();
    go(2);
  };

  const switchLang = (l: Locale) => {
    setLang(l);
    document.documentElement.lang = l;
    const rest = window.location.pathname.split("/").slice(2).join("/");
    window.history.replaceState(null, "", `/${l}${rest ? `/${rest}` : ""}${window.location.search}`);
  };

  const tapBarber = (v: string) => {
    const next = barber === v && !services.length ? null : v;
    resetTime();
    setBarber(next);
    let ids = services;
    if (next && next !== "any") {
      const b = staffById.get(next)!;
      ids = services.filter((id) => b.offers[id]);
      setServices(ids);
    }
    if (ids.length && next) go(2);
  };

  // the service row: with a barber chosen it goes on to the times; «+» only adds
  const tapService = (id: string) => {
    if (barber) {
      resetTime();
      setServices((s) => (s.includes(id) ? s : [...s, id]));
      go(2);
    } else {
      setServices((s) => (s.length === 1 && s[0] === id ? [] : [id]));
    }
  };

  const toggleService = (id: string) => {
    resetTime();
    setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const sameAgain = () => {
    if (!last) return;
    resetTime();
    setBarber(last.barber);
    setServices(last.services);
    go(2);
  };

  const pickSlot = (d: string, t: number, staffId: string, x: number) => {
    setDay(d);
    setSlot({ t, staffId, extra: x });
    setTaken(null);
    setFormError("");
    key.current = newKey();
    go(3);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !slot || taken) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = c.errName;
    if (form.phone.replace(/\D/g, "").length < 7) errs.phone = c.errPhone;
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = c.errEmail;
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
        go(4);
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

  const again = () => {
    resetTime();
    setDone(null);
    setRemembered(true);
    go(2);
  };

  /* ---------- pieces ---------- */
  // eslint-disable-next-line @next/next/no-img-element
  const face = (s: CatalogStaff) => (s.photoUrl ? <img src={s.photoUrl} alt="" width={480} height={640} decoding="async" /> : s.name.slice(0, 2).toUpperCase());
  const ava = (f: CatalogStaff | "any" | null | undefined, cls: string) =>
    f ? <span className={`ava ${cls}${f === "any" ? " any" : ""}`}>{f === "any" ? <TowerMark /> : face(f)}</span> : null;
  const myLink = mine ? mine.replace(/^\/(ru|et|en)\//, `/${lang}/`) : null;

  // 1 barber and service · 2 time · 3 details; a step behind you is a way back
  const steps = () => {
    const labels = [
      screen > 1 && barber ? `${barber === "any" ? c.anyone : staffById.get(barber)?.name ?? ""}, ${names(services)}` : c.step1,
      screen > 2 && slot ? `${dShort(localParts(slot.t, tz).date)}, ${fmtTime(slot.t)}` : c.step2,
      c.step3,
    ];
    return (
      <ol className="steps">
        {labels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const inner = (
            <>
              <span className="n">{n}</span>
              <span className="lbl">{label}</span>
            </>
          );
          return (
            <li key={n} className={n <= screen ? "on" : ""} aria-current={n === screen ? "step" : undefined}>
              {n < screen && screen < 4 ? (
                <button type="button" onClick={() => go(n)}>
                  {inner}
                </button>
              ) : (
                <span>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    );
  };

  const header = (
    <>
      <header className="top">
        <Logo />
        <div className="top-r">
          <div className="langs" role="group" aria-label="Language">
            {LOCALES.map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => switchLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {myLink && (
            <a className="mine" href={myLink} aria-label={c.myVisits}>
              <PersonIcon />
              <span className="w-only">{c.myVisits}</span>
            </a>
          )}
        </div>
      </header>
      {steps()}
      {demo && <p className="demo">{c.demo}</p>}
    </>
  );

  const card = () => {
    if (!slot || !assigned) return null;
    const start = done?.start ?? slot.t;
    const end = done?.end ?? start + durOf(assigned, services) * 60_000;
    const date = localParts(start, tz).date;
    const x = done?.extraCents ?? extra;
    return (
      <div className="card">
        <div className="kv">
          <span className="k">{c.barberK}</span>
          <span className="v">{who()}</span>
        </div>
        <div className="kv">
          <span className="k">{c.dateK}</span>
          <span className="v">{cap(dLong(date))}</span>
        </div>
        <div className="kv">
          <span className="k">{c.timeK}</span>
          <span className="v">
            {fmtTime(start)}–{fmtTime(end)}
          </span>
        </div>
        {services.map((id) => (
          <div className="kv" key={id}>
            <span className="k">{pick(svcById.get(id)?.name, lang)}</span>
            <span className="v">{eur(assigned.offers[id]?.[0] ?? 0)}</span>
          </div>
        ))}
        {x > 0 && (
          <div className="kv sp">
            <span className="k">{c.special}</span>
            <span className="v">+{eur(x)}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">{c.whereK}</span>
          <span className="v">{catalog.location.address}</span>
        </div>
        <div className="kv tot">
          <span className="k">
            {c.total} · {duration(Math.round((end - start) / 60_000), c)}
          </span>
          <span className="v">{eur(done?.totalCents ?? base + x)}</span>
        </div>
      </div>
    );
  };

  // one free time: the full price on it when it is special time
  const slotBtn = (d: string, [t, sid, x = 0]: Tuple, onPick?: () => void) => (
    <button
      key={t}
      type="button"
      className={`slot${x > 0 ? " sp" : ""}`}
      aria-label={x > 0 ? `${fmtTime(t)}, ${c.special}, ${priceAt(sid, x)}` : undefined}
      onClick={onPick ?? (() => pickSlot(d, t, sid, x))}
    >
      <span className="st">{fmtTime(t)}</span>
      {x > 0 && <span className="sp-p">{priceAt(sid, x)}</span>}
    </button>
  );

  /* ---------- screens ---------- */
  /** The visit this device booked and still has ahead: when, with whom, and the way to change it. */
  const nextVisit = () => {
    if (!next || !myLink) return null;
    const what = [staffById.get(next.staffId)?.name, names(next.services.filter((id) => svcById.has(id)))].filter(Boolean).join(" · ");
    return (
      <a className="next" href={myLink}>
        <span className="eyebrow">{c.yourVisit}</span>
        <b>
          {cap(dLong(localParts(next.start, tz).date))}, {fmtTime(next.start)}
        </b>
        {what && <span className="what">{what}</span>}
        <span className="lk">{c.changeCancel}</span>
      </a>
    );
  };

  const screen1 = () => {
    const b = barber && barber !== "any" ? staffById.get(barber) ?? null : null;
    const list = b ? catalog.services.filter((s) => b.offers[s.id]) : catalog.services;
    const ids = services;
    return (
      <div className="stack">
        <div>
          <div className="eyebrow">{c.loc}</div>
          <h1 className="h1">{c.title}</h1>
        </div>
        {nextVisit()}
        <section>
          <h2 className="label">{c.barber}</h2>
          <div className="bleed">
            <div className="chips">
              <button type="button" className="chip" aria-pressed={barber === "any"} onClick={() => tapBarber("any")}>
                <span className="ava any">
                  <TowerMark />
                </span>
                <span className="nm">{c.anyone}</span>
                <span className="sub">{ids.length ? <span className="pr">{euroRange(capable(ids).map((x) => priceOf(x, ids)))}</span> : null}</span>
              </button>
              {catalog.staff.map((s) => {
                const ok = can(s, ids);
                const stars = s.rating != null ? `★ ${s.rating.toFixed(1)}` : "";
                const sub = !ok
                  ? "—"
                  : ids.length && !barber
                    ? [eur(priceOf(s, ids)), stars].filter(Boolean).join(" · ")
                    : stars
                      ? `${stars} · ${s.reviewCount}`
                      : pick(s.role, lang);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="chip"
                    aria-pressed={barber === s.id}
                    disabled={!ok}
                    onClick={() => tapBarber(s.id)}
                    aria-label={s.rating != null ? `${s.name}, ${s.rating}, ${s.reviewCount} ${c.reviews}` : s.name}
                  >
                    <span className="ava">{face(s)}</span>
                    <span className="nm">{s.name}</span>
                    <span className="sub">{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        <section>
          <h2 className="label">{c.service}</h2>
          <div className="svcs">
            {list.map((s) => {
              const on = ids.includes(s.id);
              const price = b ? eur(b.offers[s.id][0]) : euroRange(catalog.staff.filter((x) => x.offers[s.id]).map((x) => x.offers[s.id][0]));
              const name = pick(s.name, lang);
              return (
                <div key={s.id} className={`svc${on ? " sel" : ""}`}>
                  <button type="button" className="svc-main" onClick={() => tapService(s.id)}>
                    <span className="svc-txt">
                      <span className="svc-name">{name}</span>
                      <span className="svc-dur">{duration(b ? b.offers[s.id][1] : s.durationMin, c)}</span>
                    </span>
                    <span className="svc-price">{price}</span>
                  </button>
                  <button type="button" className="svc-add" aria-pressed={on} aria-label={`${c.add}: ${name}`} onClick={() => toggleService(s.id)}>
                    <span>{on ? <CheckIcon /> : <PlusIcon />}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  };

  const screen2 = () => {
    const head = (
      <div className="when-head">
        <h1 className="h1">{c.when}</h1>
        {ready && earliest && (
          <button type="button" className="iconbtn cal-toggle" aria-pressed={calOpen} aria-label={c.monthCal} onClick={() => setCalOpen((v) => !v)}>
            <CalendarIcon />
          </button>
        )}
      </div>
    );
    if (availError) {
      return (
        <div className="stack">
          {head}
          <p className="alert">{c.errGeneric}</p>
        </div>
      );
    }
    if (!ready) {
      return (
        <div className="stack">
          {head}
          <p className="wait" role="status">
            {c.loading}
          </p>
        </div>
      );
    }
    if (!earliest) {
      const name = barber && barber !== "any" ? staffById.get(barber)?.name ?? "" : catalog.business.name;
      return (
        <div className="stack">
          {head}
          <div className="empty note">
            <p className="big">{c.noneAhead(name, horizonDays)}</p>
            {barber !== "any" && (
              <button type="button" className="btn btn-lime" onClick={() => tapBarber("any")}>
                {c.anyoneInstead}
              </button>
            )}
            {catalog.location.phone && (
              <a className="btn btn-ghost" href={`tel:${catalog.location.phone.replace(/\s/g, "")}`}>
                {c.callSalon}
              </a>
            )}
          </div>
        </div>
      );
    }
    const current = ready.days.find((d) => d.d === shownDay) ?? ready.days[0];
    const today = localParts(Date.now(), tz).date;
    let body: React.ReactNode;
    if (!current.s.length) {
      const next = ready.days.find((d) => d.d > current.d && d.s.length);
      body = (
        <div className="empty note">
          <p className="big">{current.open ? c.dayFull(dShort(current.d)) : c.closedOn(dShort(current.d))}</p>
          {next && (
            <>
              <p>{c.nextFree(dLong(next.d))}</p>
              <button type="button" className="btn btn-line" onClick={() => setDay(next.d)}>
                {c.goTo(dShort(next.d))}
              </button>
            </>
          )}
        </div>
      );
    } else {
      const groups: [string, (m: number) => boolean][] = [
        [c.morning, (m) => m < 720],
        [c.day, (m) => m >= 720 && m < 1020],
        [c.evening, (m) => m >= 1020],
      ];
      body = (
        <div className="groups">
          {groups.map(([name, f]) => {
            const xs = current.s.filter(([t]) => f(localParts(t, tz).minutes));
            if (!xs.length) return null;
            return (
              <div className="group" key={name}>
                <h3 className="label">{name}</h3>
                <div className="slots">{xs.map((x) => slotBtn(current.d, x))}</div>
              </div>
            );
          })}
          {current.s.some((x) => (x[2] ?? 0) > 0) && (
            <p className="legend">
              <i aria-hidden="true" />
              {c.specialLegend}
            </p>
          )}
        </div>
      );
    }
    const scrollDays = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });

    // phones and tablets: a strip of days to swipe (arrows from 768px: a mouse cannot swipe)
    const dayStrip = (
      <div className="strip">
        <button type="button" className="iconbtn d-only" aria-label={c.prevDays} onClick={() => scrollDays(-1)}>
          <BackIcon />
        </button>
        <div className="bleed" ref={strip}>
          <div className="days">
            {ready.days.map((d) => (
              <button
                key={d.d}
                type="button"
                className={`day${d.s.length ? "" : " off"}`}
                aria-pressed={d.d === current.d}
                aria-label={dLong(d.d)}
                onClick={() => setDay(d.d)}
              >
                <span className="wd">{d.d === today ? c.today : wd(d.d)}</span>
                <span className="dn">{Number(d.d.slice(8, 10))}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="iconbtn d-only flip" aria-label={c.nextDays} onClick={() => scrollDays(1)}>
          <BackIcon />
        </button>
      </div>
    );

    // wide screens (and phones on request): a month calendar; only days with a free time can be tapped
    const months = [...new Set(ready.days.map((d) => d.d.slice(0, 7)))];
    const month = calMonth && months.includes(calMonth) ? calMonth : current.d.slice(0, 7);
    const mi = months.indexOf(month);
    const byDate = new Map(ready.days.map((d) => [d.d, d]));
    const [cy, cm] = month.split("-").map(Number);
    const first = new Date(Date.UTC(cy, cm - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // weeks start on Monday
    const inMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
    const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: inMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
    const wdNames = Array.from({ length: 7 }, (_, i) => wd(`2024-01-0${i + 1}`)); // 01.01.2024 was a Monday
    const calendar = (
      <div className="cal">
        <div className="cal-head">
          <button type="button" className="iconbtn" disabled={mi <= 0} aria-label={c.prevDays} onClick={() => setCalMonth(months[mi - 1])}>
            <BackIcon />
          </button>
          <strong>{cap(new Intl.DateTimeFormat(INTL[lang], { month: "long", timeZone: "UTC" }).format(first))}</strong>
          <button type="button" className="iconbtn flip" disabled={mi >= months.length - 1} aria-label={c.nextDays} onClick={() => setCalMonth(months[mi + 1])}>
            <BackIcon />
          </button>
        </div>
        <div className="cal-grid">
          {wdNames.map((n) => (
            <span key={n} className="cal-wd" aria-hidden="true">
              {n}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={`_${i}`} />;
            const free = !!byDate.get(d)?.s.length;
            return (
              <button
                key={d}
                type="button"
                className={`cal-d${free ? " free" : ""}`}
                disabled={!free}
                aria-pressed={d === current.d}
                aria-label={dLong(d)}
                onClick={() => {
                  setDay(d);
                  setCalOpen(false);
                }}
              >
                {Number(d.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>
    );
    return (
      <div className="stack">
        {head}
        <div className={`when${calOpen ? " cal-open" : ""}`}>
          <div className="when-days">
            {dayStrip}
            {calendar}
          </div>
          <div className="when-times">
            <div className="day-head">
              <h2>{cap(dLong(current.d))}</h2>
              {current.s.length > 0 && <span>{c.nFree(current.s.length)}</span>}
            </div>
            {body}
          </div>
        </div>
      </div>
    );
  };

  const field = (id: "name" | "phone" | "email" | "comment", label: string, optional: boolean, input: React.ReactNode, hint?: string) => (
    <div className={`field${errors[id] ? " err" : ""}`}>
      <label className="flabel" htmlFor={`f-${id}`}>
        {label}
        {optional && <em>{c.optional}</em>}
      </label>
      {input}
      {errors[id] ? <span className="ferr">{errors[id]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
  const onField = (id: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [id]: v }));
    if (errors[id]) setErrors(({ [id]: _drop, ...rest }) => rest);
  };

  const screen3 = () => {
    if (!slot) return null;
    return (
      <div className="details">
        <div className="stack">
          <button type="button" className="vline" onClick={() => go(2)}>
            {ava(barber === "any" && !assigned ? "any" : assigned, "")}
            <span className="vline-txt">
              <strong>
                {dShort(localParts(slot.t, tz).date)}, {fmtTime(slot.t)}
              </strong>
              <span>
                {who()}, {names(services)}
              </span>
              {extra > 0 && <em className="tag">{c.special}</em>}
            </span>
            <span className="link">{c.change}</span>
          </button>
          <h1 className="h1">{c.details}</h1>
          {taken && (
            <div className="taken" role="alert">
              <h3>{c.taken}</h3>
              <p>{c.takenSub}</p>
              {taken.length > 0 && (
                <div className="slots">
                  {taken.map((x) =>
                    slotBtn(localParts(x[0], tz).date, x, () => {
                      setSlot({ t: x[0], staffId: x[1], extra: x[2] ?? 0 });
                      setTaken(null);
                      key.current = newKey();
                    }),
                  )}
                </div>
              )}
            </div>
          )}
          {remembered && <p className="welcome">{c.welcome}</p>}
          {/* «Book» is in the bottom bar, tied to this form */}
          <form id="bf" className="fields" noValidate onSubmit={submit}>
            <div className="pair">
              {field("name", c.name, false, <input className="input" id="f-name" name="name" autoComplete="name" value={form.name} onChange={onField("name")} maxLength={120} />)}
              {field(
                "phone",
                c.phone,
                false,
                <input className="input" id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={onField("phone")} maxLength={30} />,
              )}
            </div>
            {field(
              "email",
              c.email,
              true,
              <input className="input" id="f-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={onField("email")} maxLength={254} />,
              c.emailHint,
            )}
            {/* most clients leave no comment: one line until they want one */}
            {showComment || form.comment ? (
              field("comment", c.comment, true, <textarea className="input" id="f-comment" name="comment" rows={2} value={form.comment} onChange={onField("comment")} maxLength={1000} autoFocus={showComment && !form.comment} />)
            ) : (
              <button type="button" className="addline" onClick={() => setShowComment(true)}>
                <PlusIcon />
                {c.addComment}
              </button>
            )}
            <div className="switchrow">
              <span id="smsl">{c.sms}</span>
              <button type="button" className="switch" role="switch" aria-labelledby="smsl" aria-checked={sms} onClick={() => setSms((v) => !v)} />
            </div>
            {formError && (
              <p className="alert" role="alert">
                {formError}
              </p>
            )}
            <p className="small">{c.privacy}</p>
          </form>
        </div>
        <aside className="details-card">{card()}</aside>
      </div>
    );
  };

  const screen4 = () => {
    if (!done) return null;
    const token = done.manageUrl?.split("/").pop();
    return (
      <div className="stack">
        <div className="mark">
          <CheckIcon size={30} width={2.6} />
        </div>
        <div>
          <h1 className="h1">{c.booked}</h1>
        </div>
        <p className="lead">
          {c.seeYou(dLong(localParts(done.start, tz).date), fmtTime(done.start))} {sms ? c.smsNote : ""}
        </p>
        {card()}
        <div className="btns">
          {token && (
            <a className="btn btn-lime" href={`/api/ics/${token}?lang=${lang}`}>
              {c.addCal}
            </a>
          )}
          {done.manageUrl && (
            <a className="btn btn-ghost" href={done.manageUrl.replace(/^\/(ru|et|en)\//, `/${lang}/`)}>
              {c.changeCancel}
            </a>
          )}
          <p className="cut">{c.cutoff(cutoffHours)}</p>
          <button type="button" className="btn btn-line" onClick={again}>
            {c.again}
          </button>
        </div>
        {pushKey && token && <RemindMe token={token} publicKey={pushKey} c={c.remind} />}
        <InstallOffer c={c.install} />
      </div>
    );
  };

  /* ---------- the bottom bar: the same place for the next step on every screen ---------- */
  const barSpec = (): Bar | null => {
    const f: CatalogStaff | "any" | null = barber === "any" && !assigned ? "any" : assigned;
    const whoLine = { title: who(), sub: `${names(services)} · ${duration(durNow(), c)}`, mTitle: priceNow(), mSub: `${who()}, ${duration(durNow(), c)}`, price: priceNow() };
    if (screen === 1) {
      if (barber && services.length) return { face: f, ...whoLine, go: { label: c.choose, onClick: toTimes } };
      if (last && !barber && !services.length) {
        const lb = last.barber === "any" ? "any" : staffById.get(last.barber) ?? null;
        const lname = lb === "any" ? c.anyone : lb?.name ?? "";
        return {
          face: lb,
          kicker: c.sameAgain,
          plain: true,
          title: `${lname}, ${names(last.services)}`,
          price: lb && lb !== "any" ? eur(priceOf(lb, last.services)) : undefined,
          go: { label: c.choose, onClick: sameAgain },
        };
      }
      return { plain: true, title: services.length && !barber ? c.pickBarber : barber ? c.pickService : c.pickFirst, go: { label: c.choose, disabled: true } };
    }
    if (screen === 2) {
      const e = earliest;
      const at = e ? `${rel(e.d)} ${fmtTime(e.t)}${e.extra ? ` · ${priceAt(e.staffId, e.extra)}` : ""}` : "";
      return {
        back: () => go(1),
        face: f,
        ...whoLine,
        go: e
          ? {
              label: c.earliestAt(at),
              mLabel: (
                <span className="two">
                  <small>{c.earliest}</small>
                  <span>{cap(at)}</span>
                </span>
              ),
              onClick: () => pickSlot(e.d, e.t, e.staffId, e.extra),
            }
          : { label: c.earliest, disabled: true },
      };
    }
    if (screen === 3 && slot) {
      const split = extra > 0 ? c.plusSpecial(eur(base), eur(extra)) : null;
      return {
        back: () => go(2),
        face: f,
        title: who(),
        sub: split ?? `${names(services)} · ${duration(durNow(), c)}`,
        mTitle: eur(base + extra),
        mSub: split ?? `${who()}, ${duration(durNow(), c)}`,
        price: eur(base + extra),
        go: { label: submitting ? c.booking : c.book, form: "bf", disabled: submitting || !!taken },
      };
    }
    return null;
  };

  const bar = (b: Bar) => (
    <div className={`bar${more ? " more-below" : ""}`}>
      {more && (
        <button type="button" className="more" onClick={() => window.scrollBy({ top: Math.round(window.innerHeight * 0.6), behavior: "smooth" })}>
          {c.moreBelow}
          <BackIcon />
        </button>
      )}
      <div className="bar-in gut">
        {b.back && (
          <button type="button" className="iconbtn bar-back" onClick={b.back} aria-label={c.back}>
            <BackIcon />
          </button>
        )}
        {ava(b.face, `bar-ava${b.back ? " w-only" : ""}`)}
        <div className="bar-txt">
          {b.kicker && <small>{b.kicker}</small>}
          <b className={[b.plain ? "plain" : "", b.mTitle ? "w-only" : ""].join(" ").trim() || undefined}>{b.title}</b>
          {b.mTitle && <b className="p-only">{b.mTitle}</b>}
          {b.sub && <span className={b.mSub ? "w-only" : undefined}>{b.sub}</span>}
          {b.mSub && <span className="p-only">{b.mSub}</span>}
        </div>
        {b.price && <div className="bar-price w-only">{b.price}</div>}
        {/* a new button per screen: reusing one would let the tap on «Earliest»
            become a tap on «Book» as the same element turns into the submit */}
        <button
          key={`go-${screen}`}
          type={b.go.form ? "submit" : "button"}
          form={b.go.form}
          className="btn btn-lime bar-go"
          disabled={b.go.disabled}
          onClick={b.go.onClick}
        >
          {b.go.mLabel ? (
            <>
              <span className="w-only">{b.go.label}</span>
              <span className="p-only">{b.go.mLabel}</span>
            </>
          ) : (
            b.go.label
          )}
        </button>
      </div>
    </div>
  );

  const spec = barSpec();
  return (
    <>
      <main className={`app gut${spec ? " has-bar" : ""}`} aria-live="polite">
        {header}
        <div className={`flow${screen === 4 ? " narrow" : ""}`}>
          {screen === 1 && screen1()}
          {screen === 2 && screen2()}
          {screen === 3 && screen3()}
          {screen === 4 && screen4()}
          <div ref={end} className="end" aria-hidden="true" />
        </div>
      </main>
      {spec && bar(spec)}
    </>
  );
}
