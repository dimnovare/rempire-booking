"use client";

/**
 * The client booking flow: 1 who + what, 2 when, 3 details, 4 done.
 * The approved mock, on real data (docs/client-flow.md). Free times come
 * from /api/slots; «Book» posts to /api/bookings with an Idempotency-Key.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackIcon, CheckIcon, Logo, PlusIcon, TowerMark } from "@/components/brand";
import type { Catalog, CatalogStaff } from "@/lib/catalog";
import { COPY, duration, eur, euroRange, INTL, LOCALES, pick, type Locale } from "@/lib/i18n";
import { localParts } from "@/lib/tz";

type Props = {
  locale: Locale;
  catalog: Catalog;
  tz: string;
  horizonDays: number;
  cutoffHours: number;
  demo: boolean;
};

type Day = { d: string; open: boolean; s: [number, string][] };
type Avail = { key: string; offered: boolean; days: Day[] };
type Slot = { t: number; staffId: string };
type Done = { visitId: string; start: number; end: number; staffId: string; manageUrl: string | null };

const STORE = "rempire-booking:client";
// the last barber + services booked on this device: «Same as last time» is one tap
const LAST = "rempire-booking:last";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateOf = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`);

export function BookingFlow({ locale, catalog, tz, horizonDays, cutoffHours, demo }: Props) {
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
  const [taken, setTaken] = useState<[number, string][] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [last, setLast] = useState<{ barber: string; services: string[] } | null>(null);
  const [calMonth, setCalMonth] = useState<string | null>(null); // "YYYY-MM" the calendar shows
  const key = useRef("");
  const strip = useRef<HTMLDivElement>(null);

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
    } catch {
      /* private mode: nothing remembered */
    }
    // once, on arrival: the catalog does not change under the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

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
    for (const d of ready.days) if (d.s.length) return { d: d.d, t: d.s[0][0], staffId: d.s[0][1] };
    return null;
  }, [ready]);
  const shownDay = day ?? earliest?.d ?? ready?.days[0]?.d ?? null;

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('.day[aria-pressed="true"]');
    const box = strip.current;
    if (el && box) box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
  }, [shownDay, screen, ready]);

  /* ---------- formatting ---------- */
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(INTL[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(ms);
  const wd = (d: string) => new Intl.DateTimeFormat(INTL[lang], { weekday: "short", timeZone: "UTC" }).format(dateOf(d)).replace(".", "");
  const dd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const dShort = (d: string) => `${cap(wd(d))} ${dd(d)}`;
  const dLong = (d: string) =>
    new Intl.DateTimeFormat(INTL[lang], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateOf(d));

  /* ---------- who and how much ---------- */
  const assigned = slot ? staffById.get(slot.staffId) ?? null : barber && barber !== "any" ? staffById.get(barber) ?? null : null;
  const who = () => {
    if (slot && barber === "any" && assigned) return `${assigned.name} (${c.firstFree})`;
    if (barber === "any") return c.anyone;
    return assigned?.name ?? "";
  };
  const priceNow = () => (assigned ? eur(priceOf(assigned, services)) : euroRange(capable(services).map((b) => priceOf(b, services))));
  const durNow = () => durOf(assigned, services);

  /* ---------- actions ---------- */
  const go = (n: 1 | 2 | 3 | 4) => setScreen(n);
  const resetTime = () => {
    setDay(null);
    setSlot(null);
    setTaken(null);
    setCalMonth(null);
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

  const pickSlot = (d: string, t: number, staffId: string) => {
    setDay(d);
    setSlot({ t, staffId });
    setTaken(null);
    setFormError("");
    key.current = newKey();
    go(3);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !slot) return;
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
        try {
          localStorage.setItem(STORE, JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }));
          if (barber) localStorage.setItem(LAST, JSON.stringify({ barber, services }));
        } catch {
          /* not remembered: fine */
        }
        setDone({
          visitId: j.visit.id,
          start: Date.parse(j.visit.startsAt),
          end: Date.parse(j.visit.endsAt),
          staffId: j.visit.staffId,
          manageUrl: j.manageUrl,
        });
        setSlot({ t: Date.parse(j.visit.startsAt), staffId: j.visit.staffId });
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

  const header = (
    <>
      <header className="top">
        <Logo />
        <div className="langs" role="group" aria-label="Language">
          {LOCALES.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => switchLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <div className="prog" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= screen ? "on" : ""} />
        ))}
      </div>
      {demo && <p className="demo">{c.demo}</p>}
    </>
  );

  // phones get this line; wide screens the summary panel instead
  const summaryLine = (
    <div className="sumrow m-only">
      <button type="button" className="iconbtn" onClick={() => go(1)} aria-label={c.back}>
        <BackIcon />
      </button>
      <div className="sumtxt">
        <strong>{who()}</strong>
        {services.map((id) => pick(svcById.get(id)?.name, lang)).join(" + ")} · {duration(durNow(), c)} · {priceNow()} ·{" "}
        <button type="button" className="link" onClick={() => go(1)}>
          {c.change}
        </button>
      </div>
    </div>
  );

  const card = () => {
    if (!slot || !assigned) return null;
    const start = done?.start ?? slot.t;
    const end = done?.end ?? start + durOf(assigned, services) * 60_000;
    const date = localParts(start, tz).date;
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
        <div className="kv">
          <span className="k">{c.whereK}</span>
          <span className="v">{catalog.location.address}</span>
        </div>
        <div className="kv tot">
          <span className="k">
            {c.total} · {duration(Math.round((end - start) / 60_000), c)}
          </span>
          <span className="v">{eur(priceOf(assigned, services))}</span>
        </div>
      </div>
    );
  };

  /* ---------- screens ---------- */
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
        {last && !barber && !ids.length && (
          <button
            type="button"
            className="again"
            onClick={() => {
              resetTime();
              setBarber(last.barber);
              setServices(last.services);
              go(2);
            }}
          >
            <span className={`ava${last.barber === "any" ? " any" : ""}`}>
              {last.barber === "any" ? <TowerMark /> : face(staffById.get(last.barber)!)}
            </span>
            <span className="again-txt">
              <small>{c.sameAgain}</small>
              <strong>{last.barber === "any" ? c.anyone : staffById.get(last.barber)!.name}</strong>
              <span>{last.services.map((id) => pick(svcById.get(id)?.name, lang)).join(" + ")}</span>
            </span>
            <span className="again-go" aria-hidden="true">
              <BackIcon />
            </span>
          </button>
        )}
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
        {ids.length > 0 && !barber && <p className="note m-only">{c.pickBarber}</p>}
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
    if (availError) {
      return (
        <div className="stack">
          {summaryLine}
          <p className="alert">{c.errGeneric}</p>
        </div>
      );
    }
    if (!ready) {
      return (
        <div className="stack">
          {summaryLine}
          <h1 className="h1">{c.when}</h1>
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
          {summaryLine}
          <h1 className="h1">{c.when}</h1>
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
                <h2 className="label">{name}</h2>
                <div className="slots">
                  {xs.map(([t, sid]) => (
                    <button key={t} type="button" className="slot" onClick={() => pickSlot(current.d, t, sid)}>
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
                <span className="wd">{wd(d.d)}</span>
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

    // wide screens: a month calendar instead of the strip; only days with a free time can be tapped
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
              <button key={d} type="button" className={`cal-d${free ? " free" : ""}`} disabled={!free} aria-pressed={d === current.d} aria-label={dLong(d)} onClick={() => setDay(d)}>
                {Number(d.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>
    );
    return (
      <div className="stack">
        {summaryLine}
        <h1 className="h1">{c.when}</h1>
        <button type="button" className="earliest" onClick={() => pickSlot(earliest.d, earliest.t, earliest.staffId)}>
          <small>{c.earliestFree}</small>
          <span>
            {dShort(earliest.d)} · {fmtTime(earliest.t)}
          </span>
        </button>
        <div className="when">
          <div className="when-days">
            {dayStrip}
            {calendar}
          </div>
          <div className="when-times">{body}</div>
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

  const screen3 = () => (
    <div className="stack">
      <div className="sumrow">
        <button type="button" className="iconbtn" onClick={() => go(2)} aria-label={c.back}>
          <BackIcon />
        </button>
        <h1 className="h1" style={{ margin: "4px 0 0" }}>
          {c.details}
        </h1>
      </div>
      <div className="m-only">{card()}</div>
      {taken && (
        <div className="taken" role="alert">
          <h3>{c.taken}</h3>
          <p>{c.takenSub}</p>
          {taken.length > 0 && (
            <div className="slots">
              {taken.map(([t, sid]) => (
                <button
                  key={t}
                  type="button"
                  className="slot"
                  onClick={() => {
                    setSlot({ t, staffId: sid });
                    setTaken(null);
                    key.current = newKey();
                  }}
                >
                  {fmtTime(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {remembered && <p className="welcome">{c.welcome}</p>}
      <form className="fields" noValidate onSubmit={submit}>
        {field("name", c.name, false, <input className="input" id="f-name" name="name" autoComplete="name" value={form.name} onChange={onField("name")} maxLength={120} />)}
        {field(
          "phone",
          c.phone,
          false,
          <input className="input" id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={onField("phone")} maxLength={30} />,
        )}
        {field(
          "email",
          c.email,
          true,
          <input className="input" id="f-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={onField("email")} maxLength={254} />,
          c.emailHint,
        )}
        {field("comment", c.comment, true, <textarea className="input" id="f-comment" name="comment" rows={2} value={form.comment} onChange={onField("comment")} maxLength={1000} />)}
        <div className="switchrow">
          <span id="smsl">{c.sms}</span>
          <button type="button" className="switch" role="switch" aria-labelledby="smsl" aria-checked={sms} onClick={() => setSms((v) => !v)} />
        </div>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn btn-lime" disabled={submitting || !!taken}>
          {submitting ? c.booking : c.book}
        </button>
        <p className="small">{c.privacy}</p>
      </form>
    </div>
  );

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
      </div>
    );
  };

  /* ---------- the summary panel (wide screens; hidden on phones) ---------- */
  const side = () => {
    if (screen === 4) return null;
    if (screen === 3) return <aside className="side">{card()}</aside>;
    const ready1 = services.length > 0 && !!barber;
    const b = barber && barber !== "any" ? staffById.get(barber) ?? null : null;
    return (
      <aside className="side" aria-label={c.yourVisit}>
        <div className="side-in">
          <h2 className="label">{c.yourVisit}</h2>
          {barber && (
            <div className="side-who">
              <span className={`ava${barber === "any" ? " any" : ""}`}>{barber === "any" ? <TowerMark /> : b ? face(b) : null}</span>
              <strong>{who()}</strong>
            </div>
          )}
          {services.length > 0 && (
            <div className="side-list">
              {services.map((id) => (
                <div className="kv" key={id}>
                  <span className="k">{pick(svcById.get(id)?.name, lang)}</span>
                  <span className="v">{b ? eur(b.offers[id]?.[0] ?? 0) : euroRange(capable([id]).map((x) => x.offers[id][0]))}</span>
                </div>
              ))}
              <div className="kv tot">
                <span className="k">
                  {c.total} · {duration(durNow(), c)}
                </span>
                <span className="v">{priceNow()}</span>
              </div>
            </div>
          )}
          {screen === 1 &&
            (ready1 ? (
              <button
                type="button"
                className="btn btn-lime"
                onClick={() => {
                  resetTime();
                  go(2);
                }}
              >
                {c.choose}
              </button>
            ) : (
              <p className="note">{services.length && !barber ? c.pickBarber : c.pickFirst}</p>
            ))}
          {screen === 2 && (
            <button type="button" className="btn btn-ghost" onClick={() => go(1)}>
              {c.change}
            </button>
          )}
        </div>
      </aside>
    );
  };

  const showCta = screen === 1 && services.length > 0 && !!barber;
  const aside = side();
  return (
    <>
      <main className={`app gut${showCta ? " has-cta" : ""}`} aria-live="polite">
        {header}
        <div className={`flow${aside ? " has-side" : ""}`}>
          <div className="flow-main">
            {screen === 1 && screen1()}
            {screen === 2 && screen2()}
            {screen === 3 && screen3()}
            {screen === 4 && screen4()}
          </div>
          {aside}
        </div>
      </main>
      {showCta && (
        <div className="cta m-only">
          <div className="cta-in gut">
            <div className="cta-sum">
              <b>{priceNow()}</b>
              <span>{duration(durNow(), c)}</span>
            </div>
            <button
              type="button"
              className="btn btn-lime"
              onClick={() => {
                resetTime();
                go(2);
              }}
            >
              {c.choose}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
